import { Directory, File, Paths } from 'expo-file-system';

export interface LocalPickedFile {
  name: string;
  mimeType: string;
  uri: string;
  sizeBytes: number;
}

export function decodeUtf8Bytes(data: Uint8Array): string {
  let result = '';
  for (let index = 0; index < data.length; index += 1) {
    const first = data[index]!;
    if (first < 0x80) { result += String.fromCharCode(first); continue; }
    let codePoint = 0xfffd;
    if ((first & 0xe0) === 0xc0 && index + 1 < data.length) codePoint = (first & 0x1f) << 6 | data[++index]! & 0x3f;
    else if ((first & 0xf0) === 0xe0 && index + 2 < data.length) codePoint = (first & 0x0f) << 12 | (data[++index]! & 0x3f) << 6 | data[++index]! & 0x3f;
    else if ((first & 0xf8) === 0xf0 && index + 3 < data.length) codePoint = (first & 0x07) << 18 | (data[++index]! & 0x3f) << 12 | (data[++index]! & 0x3f) << 6 | data[++index]! & 0x3f;
    result += String.fromCodePoint(codePoint);
  }
  return result;
}

function firstFile(directory: Directory): File {
  const file = directory.list().find((item) => item instanceof File);
  if (!file) throw new Error('The selected document could not be copied from Android storage.');
  return file;
}

function makeStagingDirectory(prefix: string): Directory {
  const directory = new Directory(Paths.cache, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export async function readPickedFile(source: File): Promise<{ name: string; bytes: Uint8Array }> {
  const staging = makeStagingDirectory('logbook-import');
  try {
    await source.copy(staging, { overwrite: true });
    const local = firstFile(staging);
    const bytes = await local.bytes();
    if (bytes.length === 0) throw new Error('The selected document is empty.');
    return { name: local.name, bytes };
  } finally {
    if (staging.exists) staging.delete();
  }
}

export async function stagePickedFiles(sources: File[], prefix = 'logbook-attachment'): Promise<LocalPickedFile[]> {
  const staged: LocalPickedFile[] = [];
  for (const [index, source] of sources.entries()) {
    const directory = makeStagingDirectory(`${prefix}-${index}`);
    await source.copy(directory, { overwrite: true });
    const local = firstFile(directory);
    staged.push({
      name: local.name,
      mimeType: local.type || source.type || 'application/octet-stream',
      uri: local.uri,
      sizeBytes: local.size ?? source.size ?? 0
    });
  }
  return staged;
}

export async function saveLocalFileCopy(uri: string, name: string, mimeType: string): Promise<string> {
  const directory = await Directory.pickDirectoryAsync();
  const safeName = name.replace(/[^A-Za-z0-9._ -]/g, '_').trim() || 'attachment';
  const destination = directory.createFile(safeName, mimeType || 'application/octet-stream');
  destination.write(await new File(uri).bytes());
  return destination.name;
}
