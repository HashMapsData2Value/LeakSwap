import { keccak_256 } from 'js-sha3';
import { MoneroNetworkType } from 'monero-ts';
import { getPK } from '../../../algorand/projects/algorand/smart_contracts/leak_swap/toChocoBox';

export const L = 2n ** 252n + 27742317777372353535851937790883648493n;

export function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return arr;
}

export function genPrivateSpendKey(): string {
  // Generate 32 random bytes
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  // Convert to BigInt (treat as BE)
  const bn = BigInt('0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''));
  // Reduce modulo L
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const scalar = bn % L;
  // Convert reduced scalar to BE hex, then to bytes, then reverse for LE
  const hex = scalar.toString(16).padStart(64, '0');
  // Convert hex to Uint8Array (BE)
  const beBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    beBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  // Reverse for LE
  const leBytes = beBytes.reverse();
  // Return as LE hex string
  return Array.from(leBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}


export function genPrivateViewKey(privSpendHex: string): string {
  // Parse spend key as LE hex to bytes
  const spendBytes = hexToUint8Array(privSpendHex);
  // Hash with Keccak-256
  const hashHex = keccak_256(spendBytes); // 32 bytes, treat as LE hex
  // Parse hash as LE bytes
  const hashLEBytes = hexToUint8Array(hashHex);
  // Convert LE bytes to BigInt (LE)
  let bn = 0n;
  for (let i = 0; i < 32; i++) {
    bn += BigInt(hashLEBytes[i]) << (8n * BigInt(i));
  }
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const scalar = bn % L;
  // Convert to 32-byte LE hex
  const leHex = scalar.toString(16).padStart(64, '0');
  // Return as LE hex string
  return leHex.match(/.{2}/g)!.reverse().join('');
}

import { moneroBase58Encode } from './base58';

export function getCompleteAddress(privateSpendKey: string, privateViewKey: string, networkType: MoneroNetworkType): string {
  let prefix: Uint8Array;
  switch (networkType) {
    case MoneroNetworkType.MAINNET:
      prefix = new Uint8Array([0x12]); // 18 decimal
      break;
    case MoneroNetworkType.STAGENET:
      prefix = new Uint8Array([0x18]); // 24 decimal
      break;
    case MoneroNetworkType.TESTNET:
      prefix = new Uint8Array([0x35]); // 53 decimal
      break;
    default:
      throw new Error("Unsupported network type");
  }
  const spendPubKeyBytes = getPK(hexToUint8Array(privateSpendKey));
  const viewPubKeyBytes = getPK(hexToUint8Array(privateViewKey));

  // Concatenate prefix, spend key, and view key
  const addressBytes = new Uint8Array(prefix.length + spendPubKeyBytes.length + viewPubKeyBytes.length);
  addressBytes.set(prefix);
  addressBytes.set(spendPubKeyBytes, prefix.length);
  addressBytes.set(viewPubKeyBytes, prefix.length + spendPubKeyBytes.length);

  // Hash with Keccak-256
  const hash = keccak_256(addressBytes);
  const hashBytes = hexToUint8Array(hash);

  // Take first 4 bytes as checksum
  const checksum = hashBytes.slice(0, 4);

  // Concatenate address and checksum
  const completeAddress = new Uint8Array(addressBytes.length + checksum.length);
  completeAddress.set(addressBytes);
  completeAddress.set(checksum, addressBytes.length);

  // Convert to hex string for base58 encoding
  const completeHex = Array.from(completeAddress).map(b => b.toString(16).padStart(2, '0')).join('');
  // Return base58 encoded address
  return moneroBase58Encode(completeHex);
}