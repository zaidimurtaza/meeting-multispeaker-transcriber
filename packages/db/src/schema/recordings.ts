import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const recordings = pgTable("recordings", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalObjectKey: text("final_object_key"),
});

export const chunkAcks = pgTable(
  "chunk_acks",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").notNull(),
    sequenceIndex: integer("sequence_index").notNull(),
    objectKey: text("object_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chunk_acks_chunk_id_unique").on(table.chunkId),
    uniqueIndex("chunk_acks_recording_seq_unique").on(
      table.recordingId,
      table.sequenceIndex,
    ),
  ],
);
