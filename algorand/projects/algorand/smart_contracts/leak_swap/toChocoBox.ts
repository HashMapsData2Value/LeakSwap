import { ed25519 } from '@noble/curves/ed25519'
import * as utils from '@noble/curves/abstract/utils';
import { sha512 } from '@noble/hashes/sha2'

export function genScalar(): Uint8Array {
  const secretKey = ed25519.utils.randomSecretKey()
  secretKey[0] &= 248  // Clear bottom 3 bits
  secretKey[31] &= 127 // Clear top bit
  secretKey[31] |= 64  // Set second-highest bit

  if (secretKey.length !== 32) {
    throw new Error('Invalid secret key length')
  }
  return secretKey
}

export function getPK(secretKey: Uint8Array): Uint8Array {
  return ed25519.Point.BASE.multiply(utils.bytesToNumberLE(secretKey) % ed25519.Point.Fn.ORDER).toBytes()
}

export function leakySignature(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  const r = utils.numberToBytesLE(1n, 32) // r = 1 as 32-byte little-endian
  const R = ed25519.Point.BASE.toBytes()

  const publicKey = ed25519.Point.BASE.multiply(utils.bytesToNumberLE(secretKey) % ed25519.Point.Fn.ORDER).toBytes()

  // Compute challenge: H(R || A || M)
  const challengeInput = new Uint8Array([
    ...R,
    ...publicKey,
    ...message
  ])

  const challengeHash = sha512(challengeInput)

  const challengeBigInt = utils.bytesToNumberLE(challengeHash) % ed25519.Point.Fn.ORDER
  const secretKeyBigInt = utils.bytesToNumberLE(secretKey)
  const rBigInt = utils.bytesToNumberLE(r)

  // Compute s = r + H(R,A,M) * a
  const sBigInt = (rBigInt + ((challengeBigInt * secretKeyBigInt) % ed25519.Point.Fn.ORDER)) % ed25519.Point.Fn.ORDER
  const s = utils.numberToBytesLE(sBigInt, 32)

  // Signature is R || s
  const signature = new Uint8Array([
    ...R,
    ...s
  ])

  // Check that the signature is valid
  if (!ed25519.verify(signature, message, publicKey)) {
    throw new Error('Failed to produce valid signature')
  }

  return signature
}
