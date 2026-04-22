import { useCallback, useEffect, useRef, useState } from "react"

import { encodeWav, resample, TARGET_SAMPLE_RATE } from "@/lib/wav"

/** Inline worklet: taps mono input, posts Float32 copies to main thread (no deprecated ScriptProcessor). */
const CAPTURE_WORKLET_SOURCE = `
class SwadesCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0 || ch0.length === 0) return true;
    const copy = new Float32Array(ch0.length);
    copy.set(ch0);
    this.port.postMessage(copy.buffer, [copy.buffer]);
    return true;
  }
}
registerProcessor("swades-capture", SwadesCaptureProcessor);
`

export interface WavChunk {
  id: string
  blob: Blob
  url: string
  duration: number
  timestamp: number
  sequenceIndex: number
}

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused"

interface UseRecorderOptions {
  chunkDuration?: number
  deviceId?: string
  onChunk?: (chunk: WavChunk) => void
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const { chunkDuration = 2, deviceId, onChunk } = options
  const onChunkRef = useRef(onChunk)
  onChunkRef.current = onChunk

  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [chunks, setChunks] = useState<WavChunk[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const muteRef = useRef<GainNode | null>(null)
  const nativeRateRef = useRef(48000)
  const samplesRef = useRef<Float32Array[]>([])
  const sampleCountRef = useRef(0)
  const chunkThreshold = TARGET_SAMPLE_RATE * chunkDuration
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const pausedElapsedRef = useRef(0)
  const statusRef = useRef<RecorderStatus>("idle")
  const chunkSeqRef = useRef(0)

  statusRef.current = status

  const commitSamplesAsChunk = useCallback((merged: Float32Array) => {
    const blob = encodeWav(merged, TARGET_SAMPLE_RATE)
    const url = URL.createObjectURL(blob)
    const sequenceIndex = chunkSeqRef.current++
    const chunk: WavChunk = {
      id: crypto.randomUUID(),
      blob,
      url,
      duration: merged.length / TARGET_SAMPLE_RATE,
      timestamp: Date.now(),
      sequenceIndex,
    }
    setChunks((prev) => [...prev, chunk])
    onChunkRef.current?.(chunk)
  }, [])

  const flushChunk = useCallback(() => {
    if (samplesRef.current.length === 0) return

    const totalLen = samplesRef.current.reduce((n, b) => n + b.length, 0)
    const merged = new Float32Array(totalLen)
    let offset = 0
    for (const buf of samplesRef.current) {
      merged.set(buf, offset)
      offset += buf.length
    }
    samplesRef.current = []
    sampleCountRef.current = 0

    commitSamplesAsChunk(merged)
  }, [commitSamplesAsChunk])

  const start = useCallback(async () => {
    if (statusRef.current === "recording") return

    setStatus("requesting")
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      })

      const audioCtx = new AudioContext()
      const nativeRate = audioCtx.sampleRate
      nativeRateRef.current = nativeRate

      const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" })
      const workletUrl = URL.createObjectURL(blob)
      try {
        await audioCtx.audioWorklet.addModule(workletUrl)
      } finally {
        URL.revokeObjectURL(workletUrl)
      }

      const workletNode = new AudioWorkletNode(audioCtx, "swades-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      })

      workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        if (statusRef.current !== "recording") return
        const input = new Float32Array(ev.data)
        const resampled = resample(input, nativeRateRef.current, TARGET_SAMPLE_RATE)

        samplesRef.current.push(resampled)
        sampleCountRef.current += resampled.length

        if (sampleCountRef.current >= chunkThreshold) {
          const totalLen = samplesRef.current.reduce((n, b) => n + b.length, 0)
          const merged = new Float32Array(totalLen)
          let off = 0
          for (const buf of samplesRef.current) {
            merged.set(buf, off)
            off += buf.length
          }
          samplesRef.current = []
          sampleCountRef.current = 0

          commitSamplesAsChunk(merged)
        }
      }

      const source = audioCtx.createMediaStreamSource(mediaStream)
      const mute = audioCtx.createGain()
      mute.gain.value = 0
      source.connect(workletNode)
      source.connect(mute)
      mute.connect(audioCtx.destination)

      streamRef.current = mediaStream
      audioCtxRef.current = audioCtx
      workletRef.current = workletNode
      muteRef.current = mute
      setStream(mediaStream)

      samplesRef.current = []
      sampleCountRef.current = 0
      chunkSeqRef.current = 0
      pausedElapsedRef.current = 0
      startTimeRef.current = Date.now()
      setElapsed(0)
      setStatus("recording")

      timerRef.current = setInterval(() => {
        if (statusRef.current === "recording") {
          setElapsed(
            pausedElapsedRef.current + (Date.now() - startTimeRef.current) / 1000
          )
        }
      }, 100)
    } catch {
      setStatus("idle")
    }
  }, [deviceId, chunkThreshold, commitSamplesAsChunk])

  const stop = useCallback(() => {
    flushChunk()

    if (workletRef.current) {
      workletRef.current.port.onmessage = null
      workletRef.current.disconnect()
    }
    muteRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (audioCtxRef.current?.state !== "closed") {
      audioCtxRef.current?.close()
    }
    if (timerRef.current) clearInterval(timerRef.current)

    workletRef.current = null
    muteRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
    setStream(null)
    setStatus("idle")
  }, [flushChunk])

  const pause = useCallback(() => {
    if (statusRef.current !== "recording") return
    pausedElapsedRef.current += (Date.now() - startTimeRef.current) / 1000
    setStatus("paused")
  }, [])

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return
    startTimeRef.current = Date.now()
    setStatus("recording")
  }, [])

  const clearChunks = useCallback(() => {
    for (const c of chunks) URL.revokeObjectURL(c.url)
    setChunks([])
    chunkSeqRef.current = 0
  }, [chunks])

  useEffect(() => {
    return () => {
      if (workletRef.current) {
        workletRef.current.port.onmessage = null
        workletRef.current.disconnect()
      }
      muteRef.current?.disconnect()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (audioCtxRef.current?.state !== "closed") {
        audioCtxRef.current?.close()
      }
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return { status, start, stop, pause, resume, chunks, elapsed, stream, clearChunks }
}
