import { ed25519 } from '@noble/curves/ed25519'

// TODO: Merge with genPrivateSpendKey() from monero-utils.ts
export function genScalar(): Uint8Array {
  // Generate a random 32-byte secret key using ed25519's secure generation
  const secretKey = ed25519.utils.randomSecretKey()

  // Apply Ed25519 scalar formatting requirements
  secretKey[0] &= 248  // Clear bottom 3 bits
  secretKey[31] &= 127 // Clear top bit  
  secretKey[31] |= 64  // Set second-highest bit

  if (secretKey.length !== 32) {
    throw new Error('Invalid secret key length')
  }
  return secretKey
}
