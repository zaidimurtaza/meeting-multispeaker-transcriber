import type { WavChunk } from "@/hooks/use-recorder"
import { encodeWav, resample, TARGET_SAMPLE_RATE } from "@/lib/wav"

export const MAX_IMPORT_FILE_BYTES = 100 * 1024 * 1024

const ACCEPT_MIME = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
])

export function validateAudioImportFile(file: File): string | null {
  if (!file.size) {
    return "This file is empty."
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return `File is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB).`
  }
  const name = file.name.toLowerCase()
  const extOk =
    /\.(wav|mp3|m4a|aac|webm|ogg|oga|flac|mp4)$/i.test(name) || name.endsWith(".mpeg")
  const mime = file.type.toLowerCase()
  const mimeOk = !mime || [...ACCEPT_MIME].some((m) => mime === m || mime.startsWith("audio/"))
  if (!extOk && !mimeOk) {
    return "Please use a common audio format (WAV, MP3, M4A, WebM, OGG, FLAC)."
  }
  return null
}

/** Decode file to mono PCM at TARGET_SAMPLE_RATE. */
export async function decodeFileToMonoPcm16k(file: File): Promise<Float32Array> {
  const ctx = new AudioContext()
  try {
    const arrayBuf = await file.arrayBuffer()
    const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0))
    const nCh = audioBuf.numberOfChannels
    const len = audioBuf.length
    const mixed = new Float32Array(len)
    for (let c = 0; c < nCh; c++) {
      const data = audioBuf.getChannelData(c)
      for (let i = 0; i < len; i++) {
        mixed[i] += data[i] / nCh
      }
    }
    return resample(mixed, audioBuf.sampleRate, TARGET_SAMPLE_RATE)
  } finally {
    await ctx.close()
  }
}

/** Same chunking contract as live recorder: 16 kHz 16-bit WAV segments. */
export function splitPcmToWavChunks(
  pcm: Float32Array,
  chunkDurationSec: number,
): WavChunk[] {
  const samplesPerChunk = Math.floor(TARGET_SAMPLE_RATE * chunkDurationSec)
  if (samplesPerChunk < 1) {
    throw new Error("invalid chunk duration")
  }
  const out: WavChunk[] = []
  let sequenceIndex = 0
  for (let off = 0; off < pcm.length; off += samplesPerChunk) {
    const slice = pcm.subarray(off, Math.min(off + samplesPerChunk, pcm.length))
    if (slice.length === 0) {
      break
    }
    const blob = encodeWav(slice, TARGET_SAMPLE_RATE)
    const url = URL.createObjectURL(blob)
    out.push({
      id: crypto.randomUUID(),
      blob,
      url,
      duration: slice.length / TARGET_SAMPLE_RATE,
      timestamp: Date.now(),
      sequenceIndex: sequenceIndex++,
    })
  }
  return out
}
