"use client"

import { useCallback, useRef, useState } from "react"
import { FileAudio, Upload } from "lucide-react"

import { cn } from "@my-better-t-app/ui/lib/utils"

type Props = {
  disabled?: boolean
  onFile: (file: File) => void
  /** Shown inside the zone (e.g. validation). */
  localError?: string | null
}

export function AudioImportZone({ disabled, onFile, localError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const pick = useCallback(
    (file: File | null | undefined) => {
      if (!file || disabled) return
      onFile(file)
    },
    [disabled, onFile],
  )

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="audio/*,.wav,.mp3,.m4a,.aac,.webm,.ogg,.flac,.mp4"
        aria-label="Choose audio file"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (disabled) return
          const f = e.dataTransfer.files?.[0]
          if (f) pick(f)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={cn(
          "group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          disabled && "pointer-events-none opacity-50",
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border/80 bg-muted/15 hover:border-primary/50 hover:bg-muted/25",
        )}
      >
        <div
          className={cn(
            "flex size-14 items-center justify-center rounded-full transition-colors",
            dragOver ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            "group-hover:bg-primary/10 group-hover:text-primary",
          )}
        >
          {dragOver ? (
            <Upload className="size-7" aria-hidden />
          ) : (
            <FileAudio className="size-7" aria-hidden />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Drop a conversation audio file here
          </p>
          <p className="text-xs text-muted-foreground">
            or click to browse · WAV, MP3, M4A, WebM, OGG, FLAC · up to 100&nbsp;MB
          </p>
        </div>
      </button>
      {localError && (
        <p className="text-center text-xs text-destructive" role="alert">
          {localError}
        </p>
      )}
    </div>
  )
}
