import fs from "node:fs/promises";
import { WAV_HEADER_BYTES } from "./paths";

const SAMPLE_RATE = 16_000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function buildWavHeader(pcmByteLength: number): Buffer {
  const blockAlign = (NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const buffer = Buffer.alloc(WAV_HEADER_BYTES);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmByteLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmByteLength, 40);
  return buffer;
}

export async function stitchWavFiles(
  sortedChunkPaths: string[],
  outputPath: string,
): Promise<void> {
  const pcmParts: Buffer[] = [];
  for (let i = 0; i < sortedChunkPaths.length; i++) {
    const filePath = sortedChunkPaths[i];
    if (!filePath) {
      throw new Error(`missing chunk path at index ${i}`);
    }
    const buf = await fs.readFile(filePath);
    const pcm = buf.subarray(i === 0 ? 0 : WAV_HEADER_BYTES);
    pcmParts.push(pcm);
  }
  const pcm = Buffer.concat(pcmParts);
  const header = buildWavHeader(pcm.length);
  await fs.writeFile(outputPath, Buffer.concat([header, pcm]));
}
