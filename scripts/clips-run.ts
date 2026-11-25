/**
 * Автонарезки стримеров (фаза 1, см. PLAN_CLIPS.md).
 *
 *   npx tsx scripts/clips-run.ts [--streamer <login>] [--limit N] [--dry-run] [--no-db]
 *
 * Нужны: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, OPENAI_API_KEY, MONGODB_URI (если без --no-db),
 * yt-dlp и ffmpeg в PATH. Опционально: PLAYEROK_MIDROLL_PATH, CLIPS_OUTPUT_DIR.
 */
import { config } from "dotenv";
config();

import { runClipsPipeline } from "@/lib/clips/pipeline";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const results = await runClipsPipeline({
    streamer: arg("streamer"),
    limit: arg("limit") ? Number(arg("limit")) : undefined,
    dryRun: process.argv.includes("--dry-run"),
    noDb: process.argv.includes("--no-db"),
  });
  const ok = results.filter((r) => r.outputPath).length;
  const failed = results.filter((r) => r.error).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\nDone: ${ok} rendered, ${skipped} skipped, ${failed} failed`);
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
