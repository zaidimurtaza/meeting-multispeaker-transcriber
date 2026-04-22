"use client"

import { useCallback, useRef, useState } from "react"
import {
  ChevronDown,
  Download,
  Link2,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
  Upload,
} from "lucide-react"

import { env } from "@my-better-t-app/env/web"
import { Button } from "@my-better-t-app/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card"
import { Label } from "@my-better-t-app/ui/components/label"
import { cn } from "@my-better-t-app/ui/lib/utils"
import { AudioImportZone } from "@/components/audio-import-zone"
import {
  TranscriptConversation,
  type TranscriptUtterance,
} from "@/components/transcript-conversation"
import { LiveWaveform } from "@/components/ui/live-waveform"
import {
  decodeFileToMonoPcm16k,
  splitPcmToWavChunks,
  validateAudioImportFile,
} from "@/lib/file-audio-pipeline"
import { createUploadPipeline } from "@/lib/chunk-upload-pipeline"
import { readChunkFromOpfs, writeChunkToOpfs } from "@/lib/opfs-recording"
import { useRecorder, type WavChunk } from "@/hooks/use-recorder"

const CHUNK_DURATION_SEC = 2

const AUDIO_EXAMPLES = [
  { path: "/audioExample/testaudio.mp3", filename: "testaudio.mp3", label: "Sample — Professor conversation" },
  // {
  //   path: "/audioExample/Real-life-English-conversation-at-the-coffee-shop.mp3",
  //   filename: "Real-life-English-conversation-at-the-coffee-shop.mp3",
  //   label: "Sample — coffee shop conversation",
  // },
  {
    path: "/audioExample/Hotel-Check-In.mp3",
    filename: "Hotel-Check-In.mp3",
    label: "Sample — hotel check-in",
  },
  {
    path: "/audioExample/Airport-Conversation.mp3",
    filename: "Airport-Conversation.mp3",
    label: "Sample — airport conversation",
  }
] as const

function apiBase() {
  return env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "")
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1)}s`
}

function revokeChunkUrls(chunks: WavChunk[]) {
  for (const c of chunks) URL.revokeObjectURL(c.url)
}

function ChunkRow({ chunk, index }: { chunk: WavChunk; index: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      el.currentTime = 0
      setPlaying(false)
    } else {
      el.play()
      setPlaying(true)
    }
  }

  const download = () => {
    const a = document.createElement("a")
    a.href = chunk.url
    a.download = `chunk-${index + 1}.wav`
    a.click()
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border/50 bg-muted/30 px-3 py-2">
      <audio
        ref={audioRef}
        src={chunk.url}
        onEnded={() => setPlaying(false)}
        preload="none"
      />
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        #{index + 1} · seq {chunk.sequenceIndex}
      </span>
      <span className="text-xs tabular-nums">{formatDuration(chunk.duration)}</span>
      <span className="text-[10px] text-muted-foreground">16kHz PCM</span>
      <div className="ml-auto flex gap-1">
        <Button variant="ghost" size="icon-xs" onClick={toggle}>
          {playing ? <Square className="size-3" /> : <Play className="size-3" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={download}>
          <Download className="size-3" />
        </Button>
      </div>
    </div>
  )
}

type ExampleAudioSectionProps = {
  idSuffix: string
  selectedExamplePath: string
  onExamplePathChange: (path: string) => void
  onUseSample: () => void
  disabled: boolean
}

function ExampleAudioSection({
  idSuffix,
  selectedExamplePath,
  onExamplePathChange,
  onUseSample,
  disabled,
}: ExampleAudioSectionProps) {
  const selectId = `recorder-example-audio-${idSuffix}`
  const hintId = `recorder-example-audio-hint-${idSuffix}`
  const selectedSample =
    AUDIO_EXAMPLES.find((e) => e.path === selectedExamplePath) ?? AUDIO_EXAMPLES[0]

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <Label htmlFor={selectId} className="mb-2 block text-xs font-medium text-foreground">
        Example audio
      </Label>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Pick a demo clip, preview it, then run it through the same upload pipeline.
      </p>
      <div className="relative mb-3">
        <select
          id={selectId}
          className={cn(
            "h-9 w-full min-w-0 cursor-pointer appearance-none rounded-none border border-input px-2.5 py-1 pr-9 text-xs outline-none transition-colors",
            "[color-scheme:light] bg-popover text-popover-foreground",
            "dark:[color-scheme:dark] dark:bg-popover dark:text-popover-foreground",
            "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          )}
          value={selectedExamplePath}
          disabled={disabled}
          onChange={(e) => onExamplePathChange(e.target.value)}
          aria-describedby={hintId}
        >
          {AUDIO_EXAMPLES.map((ex) => (
            <option
              key={ex.path}
              value={ex.path}
              className="bg-popover text-popover-foreground"
            >
              {ex.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      <audio
        key={selectedSample.path}
        className="mb-3 h-9 w-full"
        controls
        src={selectedSample.path}
        preload="metadata"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full sm:w-auto"
        disabled={disabled}
        onClick={() => void onUseSample()}
      >
        Use selected sample
      </Button>
      <p id={hintId} className="sr-only">
        Choosing an option updates the preview and which file is sent when you use the sample.
      </p>
    </div>
  )
}

type SourceMode = "mic" | "file"

export default function RecorderPage() {
  const [deviceId] = useState<string | undefined>()
  const [sourceMode, setSourceMode] = useState<SourceMode>("mic")
  const sessionIdRef = useRef<string | null>(null)
  const pipelineRef = useRef<ReturnType<typeof createUploadPipeline> | null>(null)
  const expectedChunkCountRef = useRef(0)
  const chunkWorkTailRef = useRef(Promise.resolve())

  const [pipelinePhase, setPipelinePhase] = useState<"idle" | "working">("idle")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)

  const [transcribePhase, setTranscribePhase] = useState<
    "idle" | "transcribing" | "done" | "error"
  >("idle")
  const [transcript, setTranscript] = useState<{
    utterances: TranscriptUtterance[]
    text: string | null
  } | null>(null)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)

  const [fileChunks, setFileChunks] = useState<WavChunk[]>([])
  const [importedName, setImportedName] = useState<string | null>(null)
  const [importHint, setImportHint] = useState<string | null>(null)
  const [filePipelineBusy, setFilePipelineBusy] = useState(false)
  const [fileStepLabel, setFileStepLabel] = useState<string | null>(null)
  const [selectedExamplePath, setSelectedExamplePath] = useState<string>(
    AUDIO_EXAMPLES[0].path,
  )

  const scheduleChunkUpload = useCallback((chunk: WavChunk, recordingId: string) => {
    chunkWorkTailRef.current = chunkWorkTailRef.current.then(async () => {
      try {
        await writeChunkToOpfs(recordingId, chunk.sequenceIndex, chunk.blob)
        if (sessionIdRef.current !== recordingId) {
          return
        }
        pipelineRef.current?.enqueue({
          recordingId,
          chunkId: chunk.id,
          sequenceIndex: chunk.sequenceIndex,
          getBlob: async () => {
            const b = await readChunkFromOpfs(recordingId, chunk.sequenceIndex)
            if (!b) {
              throw new Error("chunk missing from OPFS — cannot retry upload")
            }
            return b
          },
        })
        if (sessionIdRef.current !== recordingId) {
          return
        }
        expectedChunkCountRef.current = chunk.sequenceIndex + 1
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "OPFS failed")
      }
    })
  }, [])

  const onChunk = useCallback(
    (chunk: WavChunk) => {
      const recordingId = sessionIdRef.current
      if (!recordingId) return
      scheduleChunkUpload(chunk, recordingId)
    },
    [scheduleChunkUpload],
  )

  const { status, start, stop, pause, resume, chunks, elapsed, stream, clearChunks } =
    useRecorder({ chunkDuration: CHUNK_DURATION_SEC, deviceId, onChunk })

  const isRecording = status === "recording"
  const isPaused = status === "paused"
  const isActive = isRecording || isPaused

  const runFinalizeAndTranscribe = useCallback(async (sid: string) => {
    setPipelinePhase("working")
    setPipelineError(null)
    try {
      await chunkWorkTailRef.current
      await pipelineRef.current?.drain()
      const fin = await fetch(`${apiBase()}/api/recordings/${sid}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = (await fin.json().catch(() => ({}))) as {
        audioUrl?: string
        error?: string
        acked?: number
        clientHint?: number
      }
      if (!fin.ok) {
        const detail =
          typeof body.acked === "number"
            ? ` (${body.acked} chunk(s) in DB${typeof body.clientHint === "number" ? `, client thought ${body.clientHint}` : ""})`
            : ""
        throw new Error((body.error ?? `Finalize failed (${fin.status})`) + detail)
      }
      if (body.audioUrl) {
        setAudioUrl(body.audioUrl)
        setTranscribePhase("transcribing")
        setTranscribeError(null)
        try {
          const tr = await fetch(`${apiBase()}/api/recordings/${sid}/transcribe`, {
            method: "POST",
          })
          const trBody = (await tr.json().catch(() => ({}))) as {
            utterances?: TranscriptUtterance[]
            text?: string | null
            error?: string
          }
          if (!tr.ok) {
            throw new Error(trBody.error ?? `Transcribe failed (${tr.status})`)
          }
          setTranscript({
            utterances: trBody.utterances ?? [],
            text: trBody.text ?? null,
          })
          setTranscribePhase("done")
        } catch (te) {
          setTranscribePhase("error")
          setTranscribeError(
            te instanceof Error ? te.message : "Transcription request failed",
          )
        }
      }
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Upload/finalize failed")
    } finally {
      setPipelinePhase("idle")
    }
  }, [])

  const resetOutputState = useCallback(() => {
    setAudioUrl(null)
    setTranscript(null)
    setTranscribePhase("idle")
    setTranscribeError(null)
  }, [])

  const beginRecording = useCallback(async () => {
    setPipelineError(null)
    resetOutputState()

    await chunkWorkTailRef.current
    await pipelineRef.current?.drain()

    pipelineRef.current = createUploadPipeline({ maxConcurrent: 4 })
    expectedChunkCountRef.current = 0
    chunkWorkTailRef.current = Promise.resolve()

    setFileChunks((prev) => {
      revokeChunkUrls(prev)
      return []
    })
    setImportedName(null)
    setImportHint(null)

    const res = await fetch(`${apiBase()}/api/recordings`, { method: "POST" })
    if (!res.ok) {
      throw new Error("Could not create recording session on server")
    }
    const data = (await res.json()) as { recordingId: string }
    sessionIdRef.current = data.recordingId
    clearChunks()
    await start()
  }, [clearChunks, resetOutputState, start])

  const endRecording = useCallback(async () => {
    stop()
    const sid = sessionIdRef.current
    if (!sid || expectedChunkCountRef.current === 0) {
      return
    }
    await runFinalizeAndTranscribe(sid)
  }, [runFinalizeAndTranscribe, stop])

  const handlePrimary = useCallback(async () => {
    if (isActive) {
      await endRecording()
      return
    }
    setPipelinePhase("working")
    setPipelineError(null)
    try {
      await beginRecording()
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Could not start recording")
    } finally {
      setPipelinePhase("idle")
    }
  }, [beginRecording, endRecording, isActive])

  const handleImportedFile = useCallback(
    async (file: File) => {
      if (isActive) {
        setImportHint("Stop the microphone recording before importing a file.")
        return
      }
      const v = validateAudioImportFile(file)
      if (v) {
        setImportHint(v)
        return
      }
      setImportHint(null)
      setPipelineError(null)
      resetOutputState()

      setFilePipelineBusy(true)
      setFileStepLabel("Creating session…")
      try {
        await chunkWorkTailRef.current
        await pipelineRef.current?.drain()

        pipelineRef.current = createUploadPipeline({ maxConcurrent: 4 })
        expectedChunkCountRef.current = 0
        chunkWorkTailRef.current = Promise.resolve()

        clearChunks()
        setFileChunks((prev) => {
          revokeChunkUrls(prev)
          return []
        })

        const res = await fetch(`${apiBase()}/api/recordings`, { method: "POST" })
        if (!res.ok) {
          throw new Error("Could not create recording session on server")
        }
        const data = (await res.json()) as { recordingId: string }
        const recordingId = data.recordingId
        sessionIdRef.current = recordingId

        setFileStepLabel("Decoding audio (browser)…")
        const pcm = await decodeFileToMonoPcm16k(file)
        if (pcm.length < 16) {
          throw new Error("Decoded audio is too short or unreadable.")
        }

        const wavChunks = splitPcmToWavChunks(pcm, CHUNK_DURATION_SEC)
        setFileChunks(wavChunks)
        setImportedName(file.name)

        setFileStepLabel(`Buffering ${wavChunks.length} chunk(s) to OPFS & uploading…`)
        for (const ch of wavChunks) {
          scheduleChunkUpload(ch, recordingId)
        }

        await chunkWorkTailRef.current
        await pipelineRef.current?.drain()

        setFileStepLabel(null)
        await runFinalizeAndTranscribe(recordingId)
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Import pipeline failed")
        setFileChunks((prev) => {
          revokeChunkUrls(prev)
          return []
        })
        setImportedName(null)
      } finally {
        setFilePipelineBusy(false)
        setFileStepLabel(null)
      }
    },
    [clearChunks, isActive, resetOutputState, runFinalizeAndTranscribe, scheduleChunkUpload],
  )

  const clearFileImport = useCallback(() => {
    setFileChunks((prev) => {
      revokeChunkUrls(prev)
      return []
    })
    setImportedName(null)
    setImportHint(null)
  }, [])

  const switchMode = useCallback(
    (mode: SourceMode) => {
      if (mode === sourceMode) return
      if (isActive) {
        setImportHint("Stop recording before switching source.")
        return
      }
      if (filePipelineBusy) {
        setImportHint("Wait for the current import to finish.")
        return
      }
      setImportHint(null)
      setSourceMode(mode)
      if (mode === "mic") {
        clearFileImport()
      }
    },
    [clearFileImport, filePipelineBusy, isActive, sourceMode],
  )

  const busy =
    pipelinePhase === "working" ||
    status === "requesting" ||
    transcribePhase === "transcribing" ||
    filePipelineBusy

  const handleUseSampleAudio = useCallback(
    async (sample: { path: string; filename: string }) => {
      if (isActive) {
        setImportHint("Stop the microphone recording before importing a file.")
        return
      }
      if (busy) return
      setImportHint(null)
      try {
        const res = await fetch(sample.path)
        if (!res.ok) {
          throw new Error("Sample file is missing — add it under public/audioExample/")
        }
        const blob = await res.blob()
        const file = new File([blob], sample.filename, {
          type: blob.type || "audio/mpeg",
        })
        await handleImportedFile(file)
      } catch (e) {
        setImportHint(e instanceof Error ? e.message : "Could not load sample audio")
      }
    },
    [busy, handleImportedFile, isActive],
  )

  const displayChunks = fileChunks.length > 0 ? fileChunks : chunks
  const showChunksCard = displayChunks.length > 0

  const selectedSample =
    AUDIO_EXAMPLES.find((e) => e.path === selectedExamplePath) ?? AUDIO_EXAMPLES[0]
  const exampleDisabled = busy || isActive

  return (
    <div className="container mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-8">
      <p className="w-full text-center text-xs leading-relaxed text-muted-foreground">
        Same reliable pipeline as the README: chunk → OPFS → upload → DB ack → finalize →
        optional transcription. Files are decoded to 16&nbsp;kHz mono and split into ~2&nbsp;s
        WAV chunks like live recording.
      </p>

      <div
        className="flex w-full flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-1 sm:flex-row"
        role="tablist"
        aria-label="Audio source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sourceMode === "mic"}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
            sourceMode === "mic"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => switchMode("mic")}
        >
          <Mic className="size-4" aria-hidden />
          Microphone
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sourceMode === "file"}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
            sourceMode === "file"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => switchMode("file")}
        >
          <Upload className="size-4" aria-hidden />
          Upload file
        </button>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {sourceMode === "mic" ? "Live recording" : "Upload from existing"}
          </CardTitle>
          <CardDescription>
            {sourceMode === "mic" ? (
              <>
                AudioWorklet capture · ~2&nbsp;s chunks · stop when finished to sync and
                transcribe
              </>
            ) : (
              <>
                Drop or browse a conversation file — same chunking and upload path as the mic.
                Example clips are below if you do not have a file handy.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {sourceMode === "mic" ? (
            <>
              <div className="overflow-hidden rounded-sm border border-border/50 bg-muted/20 text-foreground">
                <LiveWaveform
                  active={isRecording}
                  processing={isPaused}
                  stream={stream}
                  height={80}
                  barWidth={3}
                  barGap={1}
                  barRadius={2}
                  sensitivity={1.8}
                  smoothingTimeConstant={0.85}
                  fadeEdges
                  fadeWidth={32}
                  mode="static"
                />
              </div>

              <div className="text-center font-mono text-3xl tabular-nums tracking-tight">
                {formatTime(elapsed)}
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button
                  size="lg"
                  variant={isActive ? "destructive" : "default"}
                  className="gap-2 px-5"
                  onClick={() => void handlePrimary()}
                  disabled={busy}
                >
                  {isActive ? (
                    <>
                      <Square className="size-4" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Mic className="size-4" />
                      {busy ? "Starting…" : "Record"}
                    </>
                  )}
                </Button>

                {isActive && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2"
                    onClick={isPaused ? resume : pause}
                  >
                    {isPaused ? (
                      <>
                        <Play className="size-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="size-4" />
                        Pause
                      </>
                    )}
                  </Button>
                )}
              </div>

              {isPaused && (
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  Paused. Tap <strong>Stop</strong> to upload, finalize, and transcribe.
                </p>
              )}

              <div className="border-t border-border/60 pt-6">
                <ExampleAudioSection
                  idSuffix="mic"
                  selectedExamplePath={selectedExamplePath}
                  onExamplePathChange={setSelectedExamplePath}
                  disabled={exampleDisabled}
                  onUseSample={() => void handleUseSampleAudio(selectedSample)}
                />
              </div>
            </>
          ) : (
            <>
              <AudioImportZone
                disabled={busy || isActive}
                onFile={(f) => void handleImportedFile(f)}
                localError={importHint}
              />

              {fileStepLabel && (
                <div className="flex items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/30 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  {fileStepLabel}
                </div>
              )}
              {importedName && !filePipelineBusy && (
                <p className="text-center text-xs text-muted-foreground">
                  Last file: <span className="font-medium text-foreground">{importedName}</span> ·{" "}
                  {fileChunks.length} chunk(s)
                </p>
              )}

              <ExampleAudioSection
                idSuffix="upload"
                selectedExamplePath={selectedExamplePath}
                onExamplePathChange={setSelectedExamplePath}
                disabled={exampleDisabled}
                onUseSample={() => void handleUseSampleAudio(selectedSample)}
              />
            </>
          )}
        </CardContent>
      </Card>

      {transcribePhase === "transcribing" && (
        <div className="flex w-full items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/30 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Transcribing… (AssemblyAI — longer files take more time)
        </div>
      )}

      {pipelineError && (
        <p className="w-full text-center text-sm text-destructive">{pipelineError}</p>
      )}

      {transcribeError && (
        <p className="w-full text-center text-sm text-destructive">{transcribeError}</p>
      )}

      {audioUrl && (
        <Card className="w-full border-primary/20">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="size-4" />
              Final audio URL
            </div>
            <a
              href={audioUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs text-primary underline"
            >
              {audioUrl}
            </a>
            <audio className="w-full" controls src={audioUrl} preload="metadata" />
          </CardContent>
        </Card>
      )}

      {transcript && transcribePhase === "done" && transcript.utterances.length > 0 && (
        <TranscriptConversation
          utterances={transcript.utterances}
          fullText={transcript.text}
        />
      )}

      {transcript &&
        transcribePhase === "done" &&
        transcript.utterances.length === 0 &&
        transcript.text && (
          <Card className="w-full border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Transcript (plain)</CardTitle>
              <CardDescription>No speaker-segmented utterances returned.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{transcript.text}</p>
            </CardContent>
          </Card>
        )}

      {showChunksCard && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Chunks (local)</CardTitle>
            <CardDescription>
              {displayChunks.length} segment(s) · OPFS + parallel upload + DB ack
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {displayChunks.map((chunk, i) => (
              <ChunkRow key={chunk.id} chunk={chunk} index={i} />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 gap-1.5 self-end text-destructive"
              onClick={() => {
                if (fileChunks.length > 0) {
                  clearFileImport()
                } else {
                  clearChunks()
                }
              }}
              disabled={isActive || filePipelineBusy}
            >
              <Trash2 className="size-3" />
              Clear preview
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
