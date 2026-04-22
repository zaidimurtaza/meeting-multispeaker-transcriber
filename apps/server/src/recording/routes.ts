import { db } from "@my-better-t-app/db";
import { chunkAcks, recordings } from "@my-better-t-app/db/schema";
import { env } from "@my-better-t-app/env/server";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";
import {
  absFromObjectKey,
  chunkAbsPath,
  chunkObjectKey,
  finalAbsPath,
  finalObjectKey,
  getStorageRoot,
  recordingDir,
} from "./paths";
import { stitchWavFiles } from "./wav-stitch";
import { transcribeWavFile } from "../transcribe/assemblyai";

async function ensureDirs(recordingId: string) {
  const chunksDir = path.join(recordingDir(recordingId), "chunks");
  await fs.mkdir(chunksDir, { recursive: true });
}

function publicAudioUrl(c: { req: { url: string } }, recordingId: string): string {
  const url = new URL(c.req.url);
  return `${url.origin}/api/recordings/${recordingId}/audio`;
}

export const recordingRoutes = new Hono()
  .post("/", async (c) => {
    const id = crypto.randomUUID();
    await fs.mkdir(getStorageRoot(), { recursive: true });
    await ensureDirs(id);
    await db.insert(recordings).values({ id });
    return c.json({ recordingId: id });
  })

  .post("/:recordingId/chunks", async (c) => {
    const recordingId = c.req.param("recordingId");
    const body = await c.req.parseBody();

    const chunkId = body.chunkId;
    const sequenceIndexRaw = body.sequenceIndex;
    const file = body.file;

    if (typeof chunkId !== "string" || !chunkId) {
      return c.json({ error: "chunkId required" }, 400);
    }
    if (typeof sequenceIndexRaw !== "string" && typeof sequenceIndexRaw !== "number") {
      return c.json({ error: "sequenceIndex required" }, 400);
    }
    const sequenceIndex = Number(sequenceIndexRaw);
    if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
      return c.json({ error: "sequenceIndex must be a non-negative integer" }, 400);
    }
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "file required" }, 400);
    }

    const [rec] = await db
      .select({ id: recordings.id })
      .from(recordings)
      .where(eq(recordings.id, recordingId))
      .limit(1);
    if (!rec) {
      return c.json({ error: "recording not found" }, 404);
    }

    const [byChunkId] = await db
      .select()
      .from(chunkAcks)
      .where(eq(chunkAcks.chunkId, chunkId))
      .limit(1);

    if (byChunkId) {
      const abs = absFromObjectKey(byChunkId.objectKey);
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(abs, buf);
      } catch {
        return c.json({ error: "failed to repair chunk on disk" }, 500);
      }
      return c.json({
        ok: true,
        objectKey: byChunkId.objectKey,
        idempotent: true,
      });
    }

    const [seqConflict] = await db
      .select()
      .from(chunkAcks)
      .where(
        and(
          eq(chunkAcks.recordingId, recordingId),
          eq(chunkAcks.sequenceIndex, sequenceIndex),
        ),
      )
      .limit(1);
    if (seqConflict) {
      return c.json(
        { error: "sequence slot already used by another chunk", sequenceIndex },
        409,
      );
    }

    const objectKey = chunkObjectKey(recordingId, sequenceIndex);
    const abs = chunkAbsPath(recordingId, sequenceIndex);
    await ensureDirs(recordingId);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(abs, buf);

    const ackId = crypto.randomUUID();
    try {
      await db.insert(chunkAcks).values({
        id: ackId,
        recordingId,
        chunkId,
        sequenceIndex,
        objectKey,
      });
    } catch {
      await fs.rm(abs, { force: true });
      return c.json({ error: "failed to acknowledge chunk (retry may succeed)" }, 500);
    }

    return c.json({ ok: true, objectKey });
  })

  .post("/:recordingId/finalize", async (c) => {
    const recordingId = c.req.param("recordingId");
    let clientHint: number | undefined;
    try {
      const body = (await c.req.json()) as { expectedChunkCount?: number };
      if (
        typeof body.expectedChunkCount === "number" &&
        Number.isInteger(body.expectedChunkCount)
      ) {
        clientHint = body.expectedChunkCount;
      }
    } catch {
      /* empty body ok */
    }

    const [rec] = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, recordingId))
      .limit(1);
    if (!rec) {
      return c.json({ error: "recording not found" }, 404);
    }
    if (rec.finalObjectKey) {
      return c.json({
        audioUrl: publicAudioUrl(c, recordingId),
        alreadyFinalized: true,
      });
    }

    const acks = await db
      .select()
      .from(chunkAcks)
      .where(eq(chunkAcks.recordingId, recordingId))
      .orderBy(asc(chunkAcks.sequenceIndex));

    const n = acks.length;
    if (n === 0) {
      return c.json(
        {
          error:
            "no chunks acknowledged yet — wait for uploads to finish or check the network",
          acked: 0,
          clientHint,
        },
        409,
      );
    }

    if (clientHint !== undefined && clientHint !== n) {
      /* DB is source of truth; hint helps debug client drift */
    }

    for (let i = 0; i < n; i++) {
      if (acks[i]?.sequenceIndex !== i) {
        return c.json(
          {
            error: "gap in sequence indexes",
            at: i,
            acked: n,
            clientHint,
          },
          409,
        );
      }
    }

    const missing: number[] = [];
    const paths: string[] = [];
    for (const ack of acks) {
      const abs = absFromObjectKey(ack.objectKey);
      paths.push(abs);
      try {
        await fs.access(abs);
      } catch {
        missing.push(ack.sequenceIndex);
      }
    }
    if (missing.length > 0) {
      return c.json(
        {
          error: "bucket missing objects for acked chunks — re-upload from OPFS",
          missingSequenceIndexes: missing,
        },
        409,
      );
    }

    const outAbs = finalAbsPath(recordingId);
    await stitchWavFiles(paths, outAbs);
    const fKey = finalObjectKey(recordingId);
    await db
      .update(recordings)
      .set({
        finalObjectKey: fKey,
        finalizedAt: new Date(),
      })
      .where(eq(recordings.id, recordingId));

    return c.json({ audioUrl: publicAudioUrl(c, recordingId) });
  })

  .get("/:recordingId/audio", async (c) => {
    const recordingId = c.req.param("recordingId");
    const [rec] = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, recordingId))
      .limit(1);
    if (!rec?.finalObjectKey) {
      return c.json({ error: "recording not finalized" }, 404);
    }
    const abs = absFromObjectKey(rec.finalObjectKey);
    try {
      const data = await fs.readFile(abs);
      return new Response(data, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return c.json({ error: "audio missing from storage" }, 404);
    }
  })

  .post("/:recordingId/transcribe", async (c) => {
    const apiKey = env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: "ASSEMBLYAI_API_KEY is not configured on the server" },
        503,
      );
    }

    const recordingId = c.req.param("recordingId");
    const [rec] = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, recordingId))
      .limit(1);
    if (!rec?.finalObjectKey) {
      return c.json({ error: "recording not finalized — run finalize first" }, 400);
    }

    const abs = absFromObjectKey(rec.finalObjectKey);
    try {
      await fs.access(abs);
    } catch {
      return c.json({ error: "audio file missing from storage" }, 404);
    }

    try {
      const result = await transcribeWavFile(abs, apiKey);
      return c.json({
        transcriptId: result.transcriptId,
        text: result.text ?? null,
        utterances: result.utterances,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "transcription failed";
      return c.json({ error: message }, 502);
    }
  });
