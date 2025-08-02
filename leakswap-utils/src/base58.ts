// Monero-compatible Base58 encoding for addresses

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58base = 58;
const encodedBlockSizes = [0, 2, 3, 5, 6, 7, 9, 10, 11];
const fullBlockSize = 8;
const fullEncodedBlockSize = 11;

function hexToBin(hex: string): number[] {
  if (hex.length % 2 !== 0) throw new Error('Hex string has invalid length!');
  const out = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

function binToStr(bin: number[]): string {
  return String.fromCharCode(...bin);
}

function strToBin(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0));
}

function decode_block(data: number[], blockSize: number): number[] {
  // blockSize: number of bytes to decode (1..8)
  if (blockSize < 1 || blockSize > fullBlockSize) throw new Error('Invalid block size');
  let num = 0n;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    const idx = alphabet.indexOf(String.fromCharCode(char));
    if (idx === -1) throw new Error('Invalid Base58 character');
    num = num * BigInt(b58base) + BigInt(idx);
  }
  // Check for overflow
  const max = blockSize === 8 ? 2n ** 64n : 1n << BigInt(8 * blockSize);
  if (num >= max) throw new Error('Base58 block overflow');
  // Convert to bytes (big-endian)
  const bytes = uint64_to_8be(num, 8);
  return bytes.slice(8 - blockSize);
}

export function moneroBase58Decode(b58: string): string {
  // Returns hex string
  if (!b58) return '';
  const res: number[] = [];
  let i = 0;
  let b58Len = b58.length;
  while (b58Len > 0) {
    // Determine block size
    let curBlockSize = 0;
    let curEncodedBlockSize = 0;
    // Find which encoded block size matches the next chunk
    for (let j = 1; j <= fullBlockSize; j++) {
      if (encodedBlockSizes[j] === Math.min(b58Len, fullEncodedBlockSize)) {
        curBlockSize = j;
        curEncodedBlockSize = encodedBlockSizes[j];
        break;
      }
    }
    if (curBlockSize === 0) throw new Error('Invalid Base58 block size');
    const block = b58.substr(i, curEncodedBlockSize);
    const blockBin = strToBin(block);
    const decoded = decode_block(blockBin, curBlockSize);
    res.push(...decoded);
    i += curEncodedBlockSize;
    b58Len -= curEncodedBlockSize;
  }
  // Convert to hex string
  return res.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function uint8be_to_64(data: number[]): bigint {
  if (data.length < 1 || data.length > 8) throw new Error('Invalid input length');
  let res = 0n;
  for (let i = 0; i < data.length; i++) {
    res = (res << 8n) | BigInt(data[i]);
  }
  return res;
}

function uint64_to_8be(num: bigint, size: number): number[] {
  if (size < 1 || size > 8) throw new Error('Invalid input length');
  const res = new Array(size).fill(0);
  for (let i = size - 1; i >= 0; i--) {
    res[i] = Number(num % 256n);
    num = num / 256n;
  }
  return res;
}

function encode_block(data: number[], buf: number[], index: number): void {
  const l_data = data.length;
  if (l_data < 1 || l_data > fullBlockSize) throw new Error('Invalid block length: ' + l_data);
  let num = uint8be_to_64(data);
  let i = encodedBlockSizes[l_data] - 1;
  while (num > 0n) {
    const remainder = Number(num % BigInt(b58base));
    num = num / BigInt(b58base);
    buf[index + i] = alphabet.charCodeAt(remainder);
    i -= 1;
  }
}

export function moneroBase58Encode(hex: string): string {
  const data = hexToBin(hex);
  const l_data = data.length;
  if (l_data === 0) return '';
  const full_block_count = Math.floor(l_data / fullBlockSize);
  const last_block_size = l_data % fullBlockSize;
  const res_size = full_block_count * fullEncodedBlockSize + encodedBlockSizes[last_block_size];
  const res = new Array(res_size).fill(alphabet.charCodeAt(0));
  for (let i = 0; i < full_block_count; i++) {
    encode_block(
      data.slice(i * fullBlockSize, i * fullBlockSize + fullBlockSize),
      res,
      i * fullEncodedBlockSize
    );
  }
  if (last_block_size > 0) {
    encode_block(
      data.slice(full_block_count * fullBlockSize, full_block_count * fullBlockSize + last_block_size),
      res,
      full_block_count * fullEncodedBlockSize
    );
  }
  return binToStr(res);
}
