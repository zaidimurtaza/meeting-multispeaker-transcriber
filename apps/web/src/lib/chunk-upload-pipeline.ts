import { env } from "@my-better-t-app/env/web";

export type UploadTask = {
  recordingId: string;
  chunkId: string;
  sequenceIndex: number;
  getBlob: () => Promise<Blob>;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function runWithRetries(task: UploadTask): Promise<void> {
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const blob = await task.getBlob();
      if (!blob || blob.size === 0) {
        throw new Error("empty blob from OPFS");
      }
      const form = new FormData();
      form.set("chunkId", task.chunkId);
      form.set("sequenceIndex", String(task.sequenceIndex));
      form.set("file", blob, `${task.sequenceIndex}.wav`);

      const res = await fetch(
        `${env.NEXT_PUBLIC_SERVER_URL}/api/recordings/${task.recordingId}/chunks`,
        { method: "POST", body: form },
      );

      if (res.ok) {
        return;
      }

      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        throw new Error(errBody.error ?? "chunk sequence conflict");
      }
    } catch {
      /* retry with backoff */
    }
    await sleep(Math.min(5000, 400 * 2 ** attempt));
  }
  throw new Error(`upload failed for chunk ${task.sequenceIndex} after retries`);
}

export function createUploadPipeline(options: { maxConcurrent?: number } = {}) {
  const maxConcurrent = options.maxConcurrent ?? 4;
  const waitQueue: UploadTask[] = [];
  let active = 0;
  const inflight: Promise<void>[] = [];

  const kick = () => {
    while (active < maxConcurrent && waitQueue.length > 0) {
      const task = waitQueue.shift()!;
      active++;
      const p = runWithRetries(task)
        .finally(() => {
          active--;
          kick();
        });
      inflight.push(p);
    }
  };

  return {
    enqueue(task: UploadTask) {
      waitQueue.push(task);
      kick();
    },
    async drain(): Promise<void> {
      while (waitQueue.length > 0 || active > 0) {
        await sleep(20);
      }
      await Promise.all(inflight);
    },
  };
}
