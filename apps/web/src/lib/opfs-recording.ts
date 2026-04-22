const padSeq = (sequenceIndex: number) => String(sequenceIndex).padStart(6, "0");

export async function writeChunkToOpfs(
  recordingId: string,
  sequenceIndex: number,
  blob: Blob,
): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(recordingId, { create: true });
  const name = `${padSeq(sequenceIndex)}.wav`;
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function readChunkFromOpfs(
  recordingId: string,
  sequenceIndex: number,
): Promise<Blob | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(recordingId);
    const name = `${padSeq(sequenceIndex)}.wav`;
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return file;
  } catch {
    return null;
  }
}
