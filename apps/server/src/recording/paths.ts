import path from "node:path";

const WAV_HEADER_BYTES = 44;

export function getStorageRoot(): string {
  return path.join(process.cwd(), "storage", "bucket");
}

function absFromObjectKey(objectKey: string): string {
  const parts = objectKey.split("/").filter(Boolean);
  return path.join(getStorageRoot(), ...parts);
}

export function recordingDir(recordingId: string): string {
  return absFromObjectKey(path.posix.join("recordings", recordingId));
}

export function chunkObjectKey(recordingId: string, sequenceIndex: number): string {
  const seq = String(sequenceIndex).padStart(6, "0");
  return path.posix.join("recordings", recordingId, "chunks", `${seq}.wav`);
}

export function chunkAbsPath(recordingId: string, sequenceIndex: number): string {
  return absFromObjectKey(chunkObjectKey(recordingId, sequenceIndex));
}

export function finalObjectKey(recordingId: string): string {
  return path.posix.join("recordings", recordingId, "final.wav");
}

export function finalAbsPath(recordingId: string): string {
  return absFromObjectKey(finalObjectKey(recordingId));
}

export { absFromObjectKey, WAV_HEADER_BYTES };
