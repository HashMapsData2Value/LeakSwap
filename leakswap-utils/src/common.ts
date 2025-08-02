import { ed25519 } from "@noble/curves/ed25519";
import * as utils from '@noble/curves/abstract/utils';
import { sha512 } from '@noble/hashes/sha2'

export function getPK(scalar: Uint8Array): Uint8Array {
  return ed25519.Point.BASE.multiply(utils.bytesToNumberLE(scalar) % ed25519.Point.Fn.ORDER).toBytes()
}

export function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return arr;
}

export function leakySignature(message: Uint8Array, scalar: Uint8Array): Uint8Array {
  const r = utils.numberToBytesLE(1n, 32) // r = 1 as 32-byte little-endian
  const R = ed25519.Point.BASE.toBytes()

  // Recover public key from scalar directly
  const publicKey = getPK(scalar)

  // Compute challenge: H(R || A || M)
  const challengeInput = new Uint8Array([
    ...R,
    ...publicKey,
    ...message
  ])

  const challengeHash = sha512(challengeInput)

  const challengeBigInt = utils.bytesToNumberLE(challengeHash) % ed25519.Point.Fn.ORDER
  const secretKeyBigInt = utils.bytesToNumberLE(scalar) % ed25519.Point.Fn.ORDER // Normalize scalar
  const rBigInt = utils.bytesToNumberLE(r)

  // Compute s = r + H(R,A,M) * a
  const sBigInt = (rBigInt + ((challengeBigInt * secretKeyBigInt) % ed25519.Point.Fn.ORDER)) % ed25519.Point.Fn.ORDER
  const s = utils.numberToBytesLE(sBigInt, 32)

  // Signature is R || s
  const signature = new Uint8Array([
    ...R,
    ...s
  ])

  // Check that the signature will pass checks
  if (!ed25519.verify(signature, message, publicKey)) {
    throw new Error('Failed to produce valid signature')
  }

  // Check that the scalar can be extracted and produces the same PK (though the scalars strictly might be different)
  const extractedSK = extractScalarFromLeakySignature(signature, message, publicKey)
  const extractedPK = getPK(extractedSK)
  if (!publicKey.every((byte, index) => byte === extractedPK[index])) {
    throw new Error('Failed to extract original scalar from signature')
  }

  return signature
}

export function extractScalarFromLeakySignature(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Uint8Array {
  /*
  If you can understand this you understand the protocol.

  How Schnorr signatures work:
  s == r + hash(R|C|msg)*c
  sG == R + hash(R|C|msg)*C
  R|s (| concat) is the signature.
  c and C are the private respectively public key.
  msg is the message we are signing.

  If Algorand exposed ed25519 scalarmult as an opcode, it would be trivial to check.
  It doesn't, but it does expose ed25519verify. We can hack it to our favor. 
  If we force r = 1 (r = 0 seems to not be allowed by nacl :C):

  s == 1 + hash(R|C|msg)*c
  s - 1 == hash(R|C|msg)*c
  (s - 1)*hash(R|C|msg)^-1 == c

  The smart contract can ensure that R really is 1G, in which case s - 1 must
  be the hash(R|C|msg)*c. Since we know R, we know C and we know msg, we can calculate the
  hash and take its multiplicative inverse with s to produce the scalar c, i.e. private key.

  (Note that ed25519verify sees msg as b'progData'| program_hash | data. The new 
  ed25519verify_bare will not require those things.) 
  */

  if (signature.length !== 64) {
    throw new Error('Invalid signature length')
  }

  const R = signature.slice(0, 32)
  if (!ed25519.Point.BASE.toBytes().every((byte, index) => byte === R[index])) {
    throw new Error('R value of signature does not match BASEPOINT')
  }

  const s = signature.slice(32, 64)

  // Since s*G ≡ R + H(R || A || M) * A, where A = PK
  // ==> s == r + H(R || A || M) * a
  // ==> a == (s - r) / H(R || A || M)
  // r = 1

  // scalar == (s - 1)/(SHA512(R || A || M)

  const challengeInput = new Uint8Array([
    ...R,
    ...publicKey,
    ...message
  ])
  const challengeHash = sha512(challengeInput)
  const challengeBigInt = utils.bytesToNumberLE(challengeHash) % ed25519.Point.Fn.ORDER
  const challengeInverseBigInt = ed25519.Point.Fn.inv(challengeBigInt)

  // a = (s - r) * H^(-1) mod ORDER
  // Since r = 1:
  const sBigInt = utils.bytesToNumberLE(s)
  const numerator = (sBigInt - 1n + ed25519.Point.Fn.ORDER) % ed25519.Point.Fn.ORDER // Ensure positive
  const scalarBigInt = (numerator * challengeInverseBigInt) % ed25519.Point.Fn.ORDER

  // Convert to bytes and apply Ed25519 scalar formatting for safety
  const scalar = utils.numberToBytesLE(scalarBigInt, 32)
  return scalar
}
