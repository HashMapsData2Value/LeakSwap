import {
  getPK,
  leakySignature,
  extractScalarFromLeakySignature,
  hexToUint8Array
} from './common';
import { genPrivateSpendKey } from './monero-utils';

describe('Leaky Schnorr Signature Protocol', () => {
  let scalar: Uint8Array;
  let pk: Uint8Array;

  beforeEach(() => {
    const privSpendHex = genPrivateSpendKey(); // hex string, LE
    scalar = hexToUint8Array(privSpendHex); // Uint8Array, LE
    pk = getPK(scalar);
  });

  it('getPK should derive a public key from a scalar', () => {
    expect(pk).toBeInstanceOf(Uint8Array);
    expect(pk.length).toBe(32);
  });

  it('leakySignature should produce a valid signature and allow scalar extraction', () => {
    const message = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const signature = leakySignature(message, scalar);

    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);

    // Extract scalar from signature and check that it produces the same PK
    const extractedScalar = extractScalarFromLeakySignature(signature, message, pk);
    const extractedPK = getPK(extractedScalar);
    expect(Array.from(pk)).toEqual(Array.from(extractedPK));
  });

  it('extractScalarFromLeakySignature should throw on invalid signature length', () => {
    const message = new Uint8Array([1, 2, 3]);
    expect(() => extractScalarFromLeakySignature(new Uint8Array(10), message, pk)).toThrow('Invalid signature length');
  });

  it('extractScalarFromLeakySignature should throw if R is not BASEPOINT', () => {
    const message = new Uint8Array([1, 2, 3]);
    // Create a fake signature with wrong R
    const signature = new Uint8Array(64);
    signature.set(new Uint8Array(32).fill(42), 0); // R is not BASEPOINT
    expect(() => extractScalarFromLeakySignature(signature, message, pk)).toThrow('R value of signature does not match BASEPOINT');
  });
});