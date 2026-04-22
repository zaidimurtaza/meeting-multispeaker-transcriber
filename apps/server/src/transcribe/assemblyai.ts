import fs from "node:fs/promises";

const BASE_URL = "https://api.assemblyai.com";

export type Utterance = {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
};

type AssemblyUtterance = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};

function dedupeUtterances(rows: AssemblyUtterance[]): Utterance[] {
  const seen = new Set<string>();
  const out: Utterance[] = [];
  for (const u of rows) {
    const key = `${u.speaker}|${u.start}|${u.end}|${u.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      speaker: u.speaker,
      text: u.text.trim(),
      startMs: u.start,
      endMs: u.end,
    });
  }
  return out;
}

async function assemblyFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: apiKey,
      ...init?.headers,
    },
  });
}

export async function uploadAudioBuffer(
  audio: Buffer,
  apiKey: string,
): Promise<string> {
  const res = await assemblyFetch(apiKey, "/v2/upload", {
    method: "POST",
    body: new Uint8Array(audio),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AssemblyAI upload failed (${res.status}): ${t}`);
  }
  const data = (await res.json()) as { upload_url?: string };
  if (!data.upload_url) {
    throw new Error("AssemblyAI upload: missing upload_url");
  }
  return data.upload_url;
}

const TRANSCRIPT_BODY_FULL = {
  language_detection: true,
  speech_models: ["universal-3-pro", "universal-2"],
  speaker_labels: true,
} as const;

const TRANSCRIPT_BODY_FALLBACK = {
  language_detection: true,
  speaker_labels: true,
} as const;

export async function createTranscript(
  audioUrl: string,
  apiKey: string,
): Promise<string> {
  const tryCreate = async (extra: Record<string, unknown>) => {
    const res = await assemblyFetch(apiKey, "/v2/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl, ...extra }),
    });
    const t = await res.text();
    return { ok: res.ok, status: res.status, text: t };
  };

  let r = await tryCreate({ ...TRANSCRIPT_BODY_FULL });
  if (!r.ok && (r.status === 400 || r.status === 403)) {
    r = await tryCreate({ ...TRANSCRIPT_BODY_FALLBACK });
  }
  if (!r.ok) {
    throw new Error(`AssemblyAI transcript create failed (${r.status}): ${r.text}`);
  }
  let data: { id?: string };
  try {
    data = JSON.parse(r.text) as { id?: string };
  } catch {
    throw new Error(`AssemblyAI transcript: invalid JSON: ${r.text.slice(0, 200)}`);
  }
  if (!data.id) {
    throw new Error("AssemblyAI transcript: missing id");
  }
  return data.id;
}

export async function pollTranscriptUntilComplete(
  transcriptId: string,
  apiKey: string,
  options?: { pollIntervalMs?: number; maxWaitMs?: number },
): Promise<{ utterances: Utterance[]; text?: string }> {
  const pollMs = options?.pollIntervalMs ?? 3000;
  const maxWaitMs = options?.maxWaitMs ?? 20 * 60 * 1000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await assemblyFetch(apiKey, `/v2/transcript/${transcriptId}`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AssemblyAI poll failed (${res.status}): ${t}`);
    }

    const result = (await res.json()) as {
      status: string;
      error?: string;
      utterances?: AssemblyUtterance[];
      text?: string;
    };

    if (result.status === "completed") {
      const utterances = dedupeUtterances(result.utterances ?? []);
      return {
        utterances,
        text: result.text,
      };
    }

    if (result.status === "error") {
      throw new Error(result.error ?? "AssemblyAI transcription error");
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error("AssemblyAI transcription timed out");
}

export async function transcribeWavFile(
  absolutePath: string,
  apiKey: string,
): Promise<{ utterances: Utterance[]; text?: string; transcriptId: string }> {
  const buf = await fs.readFile(absolutePath);
  const uploadUrl = await uploadAudioBuffer(buf, apiKey);
  const transcriptId = await createTranscript(uploadUrl, apiKey);
  const { utterances, text } = await pollTranscriptUntilComplete(
    transcriptId,
    apiKey,
  );
  return { utterances, text, transcriptId };
}
