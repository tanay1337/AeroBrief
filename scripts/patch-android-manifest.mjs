import { readFileSync, writeFileSync } from 'node:fs';

const [manifestPath, versionName, versionCodeText] = process.argv.slice(2);
if (!manifestPath || !versionName || !versionCodeText) {
  throw new Error('Usage: node scripts/patch-android-manifest.mjs <AndroidManifest.xml> <versionName> <versionCode>');
}
const versionCode = Number(versionCodeText);
const bytes = new Uint8Array(readFileSync(manifestPath));
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u16 = (offset) => view.getUint16(offset, true);
const u32 = (offset) => view.getUint32(offset, true);
const setU32 = (offset, value) => view.setUint32(offset, value, true);

const decodeLength8 = (offset) => {
  const first = bytes[offset];
  if (first === undefined) throw new Error('Invalid UTF-8 string length');
  return first & 0x80 ? { length: ((first & 0x7f) << 8) | (bytes[offset + 1] ?? 0), size: 2 } : { length: first, size: 1 };
};
const decodeLength16 = (offset) => {
  const first = u16(offset);
  return first & 0x8000 ? { length: ((first & 0x7fff) << 16) | u16(offset + 2), size: 4 } : { length: first, size: 2 };
};

let poolOffset = 8;
while (poolOffset < bytes.length && u16(poolOffset) !== 0x0001) poolOffset += u32(poolOffset + 4);
if (poolOffset >= bytes.length) throw new Error('Android string pool not found');
const poolHeaderSize = u16(poolOffset + 2);
const poolSize = u32(poolOffset + 4);
const stringCount = u32(poolOffset + 8);
const flags = u32(poolOffset + 16);
const stringsStart = u32(poolOffset + 20);
const stylesStart = u32(poolOffset + 24);
const utf8 = (flags & 0x100) !== 0;
const decoder = new TextDecoder('utf-8');
const strings = [];
const locations = [];

for (let index = 0; index < stringCount; index += 1) {
  const relative = u32(poolOffset + poolHeaderSize + index * 4);
  let cursor = poolOffset + stringsStart + relative;
  if (utf8) {
    const utf16Length = decodeLength8(cursor);
    cursor += utf16Length.size;
    const byteLength = decodeLength8(cursor);
    cursor += byteLength.size;
    strings.push(decoder.decode(bytes.subarray(cursor, cursor + byteLength.length)));
    locations.push({ offset: cursor, byteLength: byteLength.length, utf8: true, relative, entryOffset: poolOffset + stringsStart + relative, prefixSize: utf16Length.size + byteLength.size });
  } else {
    const length = decodeLength16(cursor);
    cursor += length.size;
    let value = '';
    for (let char = 0; char < length.length; char += 1) value += String.fromCharCode(u16(cursor + char * 2));
    strings.push(value);
    locations.push({ offset: cursor, byteLength: length.length * 2, utf8: false, relative, entryOffset: poolOffset + stringsStart + relative, prefixSize: length.size });
  }
}

const versionCodeNameIndex = strings.indexOf('versionCode');
const versionNameNameIndex = strings.indexOf('versionName');
if (versionCodeNameIndex < 0) throw new Error('versionCode attribute name not found');
if (versionNameNameIndex < 0) throw new Error('versionName attribute name not found');
let cursor = poolOffset + poolSize;
let patchedCode = false;
let versionStringIndex = -1;
while (cursor + 8 <= bytes.length) {
  const type = u16(cursor);
  const size = u32(cursor + 4);
  if (size < 8 || cursor + size > bytes.length) break;
  if (type === 0x0102) {
    const attributeStart = u16(cursor + 24);
    const attributeSize = u16(cursor + 26);
    const attributeCount = u16(cursor + 28);
    const firstAttribute = cursor + 16 + attributeStart;
    for (let index = 0; index < attributeCount; index += 1) {
      const attribute = firstAttribute + index * attributeSize;
      if (u32(attribute + 4) === versionCodeNameIndex) {
        setU32(attribute + 16, versionCode);
        patchedCode = true;
      }
      if (u32(attribute + 4) === versionNameNameIndex) {
        const rawValueIndex = u32(attribute + 8);
        versionStringIndex = rawValueIndex === 0xffffffff ? u32(attribute + 16) : rawValueIndex;
      }
    }
  }
  cursor += size;
}
if (!patchedCode) throw new Error('versionCode value not found');
if (versionStringIndex < 0) throw new Error('versionName value not found');
const location = locations[versionStringIndex];
if (!location) throw new Error('Version string location not found');
const encoded = new TextEncoder().encode(versionName);
const encodeLength8 = (length) => length < 0x80 ? new Uint8Array([length]) : new Uint8Array([0x80 | length >> 8, length & 0xff]);
const encodeLength16 = (length) => length < 0x8000 ? new Uint8Array([length & 0xff, length >> 8]) : new Uint8Array([length >> 16 | 0x80, length >> 24, length & 0xff, length >> 8 & 0xff]);
const concatenate = (...parts) => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) { result.set(part, position); position += part.length; }
  return result;
};

if (stylesStart !== 0) throw new Error('Version replacement does not support styled Android string pools');
const oldTerminatorSize = location.utf8 ? 1 : 2;
const oldEntryLength = location.prefixSize + location.byteLength + oldTerminatorSize;
const newEntry = location.utf8
  ? concatenate(encodeLength8(versionName.length), encodeLength8(encoded.length), encoded, new Uint8Array([0]))
  : concatenate(encodeLength16(versionName.length), new Uint8Array([...versionName].flatMap((character) => [character.charCodeAt(0) & 0xff, character.charCodeAt(0) >> 8])), new Uint8Array([0, 0]));
const delta = newEntry.length - oldEntryLength;
const stringDataStart = poolOffset + stringsStart;
const oldStringDataLength = Math.max(...locations.map((item) => item.entryOffset + item.prefixSize + item.byteLength + (item.utf8 ? 1 : 2))) - stringDataStart;
const oldStringData = bytes.subarray(stringDataStart, stringDataStart + oldStringDataLength);
const targetRelative = location.entryOffset - stringDataStart;
const newStringData = concatenate(oldStringData.subarray(0, targetRelative), newEntry, oldStringData.subarray(targetRelative + oldEntryLength));
const newPoolSize = Math.ceil((stringsStart + newStringData.length) / 4) * 4;
const newPool = new Uint8Array(newPoolSize);
newPool.set(bytes.subarray(poolOffset, stringDataStart), 0);
newPool.set(newStringData, stringsStart);
const newPoolView = new DataView(newPool.buffer);
newPoolView.setUint32(4, newPoolSize, true);
for (let index = 0; index < stringCount; index += 1) {
  const offsetLocation = poolHeaderSize + index * 4;
  const relative = newPoolView.getUint32(offsetLocation, true);
  if (relative > location.relative) newPoolView.setUint32(offsetLocation, relative + delta, true);
}
const output = concatenate(bytes.subarray(0, poolOffset), newPool, bytes.subarray(poolOffset + poolSize));
new DataView(output.buffer, output.byteOffset, output.byteLength).setUint32(4, output.byteLength, true);
writeFileSync(manifestPath, output);
console.log(`Patched Android manifest to ${versionName} (${versionCode}).`);
