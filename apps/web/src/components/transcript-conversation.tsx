"use client"

import { Users } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card"

export type TranscriptUtterance = {
  speaker: string
  text: string
  startMs: number
  endMs: number
}

export function formatSpeakerLabel(speaker: string) {
  if (/^[A-Z]$/i.test(speaker)) {
    return `Speaker ${speaker.toUpperCase()}`
  }
  return speaker
}

function formatUtteranceTime(startMs: number, endMs: number) {
  const startSec = Math.round(startMs / 100) / 10
  const endSec = Math.round(endMs / 100) / 10
  return `${startSec}s – ${endSec}s`
}

const SPEAKER_STYLES = [
  "border-l-sky-500 bg-sky-500/5",
  "border-l-amber-500 bg-amber-500/5",
  "border-l-emerald-500 bg-emerald-500/5",
  "border-l-violet-500 bg-violet-500/5",
  "border-l-rose-500 bg-rose-500/5",
]

function speakerStyle(speaker: string): string {
  let h = 0
  for (let i = 0; i < speaker.length; i++) {
    h = (h + speaker.charCodeAt(i) * (i + 1)) % 997
  }
  return SPEAKER_STYLES[h % SPEAKER_STYLES.length] ?? SPEAKER_STYLES[0]
}

function groupConsecutiveBySpeaker(utterances: TranscriptUtterance[]) {
  const blocks: { speaker: string; items: TranscriptUtterance[] }[] = []
  for (const u of utterances) {
    const last = blocks[blocks.length - 1]
    if (last?.speaker === u.speaker) {
      last.items.push(u)
    } else {
      blocks.push({ speaker: u.speaker, items: [u] })
    }
  }
  return blocks
}

function labelForGrouping(speaker: string) {
  return formatSpeakerLabel(speaker)
}

export function TranscriptConversation({
  utterances,
  fullText,
}: {
  utterances: TranscriptUtterance[]
  fullText?: string | null
}) {
  const blocks = groupConsecutiveBySpeaker(utterances)
  const uniqueSpeakers = [...new Set(utterances.map((u) => u.speaker))].sort()

  return (
    <Card className="w-full max-w-3xl border-border/80">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="size-5 opacity-80" />
              Conversation
            </CardTitle>
            <CardDescription>
              Speaker diarization from AssemblyAI · {utterances.length} segments ·{" "}
              {uniqueSpeakers.length} voice{uniqueSpeakers.length === 1 ? "" : "s"} in
              the room
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {uniqueSpeakers.map((s) => (
              <span
                key={s}
                className={`rounded-full border border-border/70 px-2.5 py-0.5 text-xs font-medium ${speakerStyle(s)} border-l-4`}
              >
                {labelForGrouping(s)}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="relative pl-3">
          <div
            className="absolute bottom-0 left-[7px] top-0 w-px bg-border/80"
            aria-hidden
          />
          <div className="flex flex-col gap-8">
            {blocks.map((block, bi) => (
              <section key={`${block.speaker}-${bi}`} className="relative">
                <header className="mb-3 flex items-baseline gap-3">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold tracking-tight ${speakerStyle(block.speaker)}`}
                  >
                    {labelForGrouping(block.speaker)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {block.items.length} turn{block.items.length === 1 ? "" : "s"}
                  </span>
                </header>
                <ul className="flex flex-col gap-4">
                  {block.items.map((u, ui) => (
                    <li
                      key={`${u.startMs}-${u.endMs}-${ui}-${u.text.slice(0, 12)}`}
                      className={`rounded-r-md border border-l-4 border-border/50 pl-4 pr-3 py-3 text-sm leading-relaxed shadow-sm ${speakerStyle(u.speaker)}`}
                    >
                      <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {formatUtteranceTime(u.startMs, u.endMs)}
                      </div>
                      <p className="text-foreground/95">{u.text}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        {fullText && (
          <details className="mt-8 rounded-md border border-dashed border-border/70 bg-muted/20 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              Full plain transcript
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {fullText}
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
