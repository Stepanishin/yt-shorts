import { getMongoDatabase } from "@/lib/db/mongodb";
import type { TwitchClip } from "./twitch";

export type StreamClipStatus = "rendered" | "posted" | "failed" | "skipped";

export interface StreamClipRecord {
  clipId: string;
  streamer: string;
  title: string;
  twitchUrl: string;
  twitchViews: number;
  durationSec: number;
  status: StreamClipStatus;
  outputPath?: string;
  postTitle?: string;
  postDescription?: string;
  hasMidroll?: boolean;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = "stream_clips";

async function collection() {
  const db = await getMongoDatabase();
  const col = db.collection<StreamClipRecord>(COLLECTION);
  await col.createIndex({ clipId: 1 }, { unique: true });
  return col;
}

export async function filterUnprocessed(clips: TwitchClip[]): Promise<TwitchClip[]> {
  if (clips.length === 0) return [];
  const col = await collection();
  const existing = await col
    .find({ clipId: { $in: clips.map((c) => c.id) } }, { projection: { clipId: 1 } })
    .toArray();
  const seen = new Set(existing.map((r) => r.clipId));
  return clips.filter((c) => !seen.has(c.id));
}

export async function saveClipResult(
  clip: TwitchClip,
  streamer: string,
  data: Partial<StreamClipRecord> & { status: StreamClipStatus }
) {
  const col = await collection();
  const now = new Date();
  await col.updateOne(
    { clipId: clip.id },
    {
      $set: {
        streamer,
        title: clip.title,
        twitchUrl: clip.url,
        twitchViews: clip.view_count,
        durationSec: clip.duration,
        ...data,
        updatedAt: now,
      },
      $setOnInsert: { clipId: clip.id, createdAt: now },
    },
    { upsert: true }
  );
}
