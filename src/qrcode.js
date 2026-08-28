/*
 * QR encoder adapted from Project Nayuki's QR Code generator concepts.
 * Copyright (c) Project Nayuki. MIT License: https://www.nayuki.io/page/qr-code-generator-library
 * This local implementation is byte-mode UTF-8, QR versions 1-40.
 */
import { deflateSync } from 'node:zlib';

const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
const LEVEL = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_LEVEL = { L: 1, M: 0, Q: 3, H: 2 };
const EXP = new Array(512);
const LOG = new Array(256);

{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255];
}

function multiply(left, right) {
  return left && right ? EXP[LOG[left] + LOG[right]] : 0;
}

function generatorPolynomial(degree) {
  let polynomial = [1];
  for (let rootIndex = 0; rootIndex < degree; rootIndex += 1) {
    const next = new Array(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= multiply(polynomial[index], EXP[rootIndex]);
      next[index + 1] ^= polynomial[index];
    }
    polynomial = next;
  }
  return polynomial.reverse();
}

function reedSolomonRemainder(data, generator) {
  const degree = generator.length - 1;
  const result = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    if (factor) {
      for (let index = 0; index < degree; index += 1) {
        result[index] ^= multiply(generator[index + 1], factor);
      }
    }
  }
  return result;
}

function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignCount = Math.floor(version / 7) + 2;
    result -= (25 * alignCount - 10) * alignCount - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function totalCodewords(version) {
  return Math.floor(rawDataModules(version) / 8);
}

function dataCodewords(version, levelIndex) {
  return totalCodewords(version) - ECC_PER_BLOCK[levelIndex][version] * NUM_BLOCKS[levelIndex][version];
}

function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

export function makeQrMatrix(text, errorCorrection = 'M') {
  const levelIndex = LEVEL[errorCorrection];
  if (levelIndex == null) throw new Error('Mức sửa lỗi QR không hợp lệ');
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let version = -1;
  for (let candidate = 1; candidate <= 40; candidate += 1) {
    const countBits = candidate <= 9 ? 8 : 16;
    const used = 4 + countBits + bytes.length * 8;
    if (bytes.length < 2 ** countBits && used <= dataCodewords(candidate, levelIndex) * 8) {
      version = candidate;
      break;
    }
  }
  if (version < 0) throw new Error('Chuỗi vượt dung lượng QR Code phiên bản 40');

  const size = version * 4 + 17;
  const capacityBits = dataCodewords(version, levelIndex) * 8;
  const bits = [];
  const push = (value, count) => {
    for (let index = count - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };
  push(4, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacityBits - bits.length));
  if (bits.length % 8) push(0, 8 - (bits.length % 8));
  let firstPad = true;
  while (bits.length < capacityBits) {
    push(firstPad ? 0xec : 0x11, 8);
    firstPad = !firstPad;
  }
  const data = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let index = 0; index < 8; index += 1) byte = (byte << 1) | bits[offset + index];
    data.push(byte);
  }

  const blockCount = NUM_BLOCKS[levelIndex][version];
  const eccLength = ECC_PER_BLOCK[levelIndex][version];
  const rawCodewords = totalCodewords(version);
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const generator = generatorPolynomial(eccLength);
  const blocks = [];
  let dataOffset = 0;
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const dataLength = shortBlockLength - eccLength + (blockIndex < shortBlockCount ? 0 : 1);
    const blockData = data.slice(dataOffset, dataOffset + dataLength);
    dataOffset += dataLength;
    const block = blockData.concat(reedSolomonRemainder(blockData, generator));
    if (blockIndex < shortBlockCount) block.splice(dataLength, 0, 0);
    blocks.push(block);
  }
  const codewords = [];
  for (let column = 0; column < blocks[0].length; column += 1) {
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      if (column !== shortBlockLength - eccLength || blockIndex >= shortBlockCount) {
        codewords.push(blocks[blockIndex][column]);
      }
    }
  }

  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  const drawFinder = (centerX, centerY) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const x = centerX + dx;
        const y = centerY + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, distance !== 2 && distance !== 4);
      }
    }
  };
  const drawAlignment = (centerX, centerY) => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };
  const drawFormat = (mask) => {
    const dataBits = (FORMAT_LEVEL[errorCorrection] << 3) | mask;
    let remainder = dataBits;
    for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const formatBits = ((dataBits << 10) | remainder) ^ 0x5412;
    for (let index = 0; index <= 5; index += 1) setFunction(8, index, getBit(formatBits, index));
    setFunction(8, 7, getBit(formatBits, 6));
    setFunction(8, 8, getBit(formatBits, 7));
    setFunction(7, 8, getBit(formatBits, 8));
    for (let index = 9; index < 15; index += 1) setFunction(14 - index, 8, getBit(formatBits, index));
    for (let index = 0; index <= 7; index += 1) setFunction(size - 1 - index, 8, getBit(formatBits, index));
    for (let index = 8; index < 15; index += 1) setFunction(8, size - 15 + index, getBit(formatBits, index));
    setFunction(8, size - 8, true);
  };

  for (let index = 0; index < size; index += 1) {
    setFunction(6, index, index % 2 === 0);
    setFunction(index, 6, index % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  const positions = alignmentPositions(version);
  for (let row = 0; row < positions.length; row += 1) {
    for (let column = 0; column < positions.length; column += 1) {
      const overlapsFinder = (row === 0 && column === 0)
        || (row === 0 && column === positions.length - 1)
        || (row === positions.length - 1 && column === 0);
      if (!overlapsFinder) drawAlignment(positions[row], positions[column]);
    }
  }
  drawFormat(0);
  if (version >= 7) {
    let remainder = version;
    for (let index = 0; index < 12; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const versionBits = (version << 12) | remainder;
    for (let index = 0; index < 18; index += 1) {
      const primary = size - 11 + (index % 3);
      const secondary = Math.floor(index / 3);
      setFunction(primary, secondary, getBit(versionBits, index));
      setFunction(secondary, primary, getBit(versionBits, index));
    }
  }
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex += 1;
        }
      }
    }
  }

  const maskBit = (mask, x, y) => {
    if (mask === 0) return (x + y) % 2 === 0;
    if (mask === 1) return y % 2 === 0;
    if (mask === 2) return x % 3 === 0;
    if (mask === 3) return (x + y) % 3 === 0;
    if (mask === 4) return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    if (mask === 5) return ((x * y) % 2) + ((x * y) % 3) === 0;
    if (mask === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  };
  const applyMask = (mask) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isFunction[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x];
      }
    }
  };
  const penalty = () => {
    let result = 0;
    const scanLines = (getter) => {
      let subtotal = 0;
      for (let line = 0; line < size; line += 1) {
        const values = [0, 0, 0, 0];
        for (let index = 0; index < size; index += 1) values.push(getter(line, index) ? 1 : 0);
        values.push(0, 0, 0, 0);
        let run = 0;
        let previous = -1;
        for (let index = 0; index < values.length; index += 1) {
          if (values[index] === previous) run += 1;
          else {
            if (previous === 1 && run >= 5) subtotal += 3 + run - 5;
            previous = values[index];
            run = 1;
          }
        }
        if (previous === 1 && run >= 5) subtotal += 3 + run - 5;
        const firstPattern = '10111010000';
        const secondPattern = '00001011101';
        for (let offset = 0; offset + 11 <= values.length; offset += 1) {
          const candidate = values.slice(offset, offset + 11).join('');
          if (candidate === firstPattern || candidate === secondPattern) subtotal += 40;
        }
      }
      return subtotal;
    };
    result += scanLines((line, index) => modules[line][index]);
    result += scanLines((line, index) => modules[index][line]);
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) result += 3;
      }
    }
    let dark = 0;
    for (const row of modules) for (const module of row) if (module) dark += 1;
    result += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    return result;
  };

  let bestMask = 0;
  let minimumPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(mask);
    drawFormat(mask);
    const score = penalty();
    if (score < minimumPenalty) {
      minimumPenalty = score;
      bestMask = mask;
    }
    applyMask(mask);
  }
  applyMask(bestMask);
  drawFormat(bestMask);
  return modules;
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, value) => {
      let item = value;
      for (let bit = 0; bit < 8; bit += 1) item = (item & 1) ? 0xedb88320 ^ (item >>> 1) : item >>> 1;
      return item >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

export function qrPng(text, { scale = 6, quietZone = 4 } = {}) {
  const matrix = makeQrMatrix(text, 'M');
  const width = (matrix.length + quietZone * 2) * scale;
  const rows = [];
  for (let pixelY = 0; pixelY < width; pixelY += 1) {
    const row = Buffer.alloc(width + 1, 0xff);
    row[0] = 0;
    const moduleY = Math.floor(pixelY / scale) - quietZone;
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const moduleX = Math.floor(pixelX / scale) - quietZone;
      if (moduleY >= 0 && moduleY < matrix.length && moduleX >= 0 && moduleX < matrix.length) {
        row[pixelX + 1] = matrix[moduleY][moduleX] ? 0 : 0xff;
      }
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  header[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
