/**
 * Подборка из готовых YouTube Shorts для Instagram Reels (см. lib/clips/compilation.ts).
 *
 *   npx tsx scripts/compile-run.ts [--items 5] [--channel buster] [--dry-run] [--no-db] [--videos id1,id2,...]
 *
 * Нужны: OPENAI_API_KEY, MONGODB_URI (если без --no-db), yt-dlp и ffmpeg.
 * Опционально: PLAYEROK_MIDROLL_PATH, CLIPS_OUTPUT_DIR, CLIPS_TITLE_FONT.
 */
import { config } from "dotenv";
config();

import { buildCompilation } from "@/lib/clips/compilation";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const result = await buildCompilation({
    items: arg("items") ? Number(arg("items")) : undefined,
    channel: arg("channel"),
    dryRun: process.argv.includes("--dry-run"),
    noDb: process.argv.includes("--no-db"),
    videoIds: arg("videos")?.split(",").filter(Boolean),
  });
  if (!result) return;
  console.log(`\n✅ ${result.outputPath} (${result.duration.toFixed(1)}s)`);
  console.log(`   ${result.headline}`);
  for (const item of result.items) console.log(`   #${item.rank} ${item.title}  [${item.channel}, ${item.views} views]`);
  console.log(`   caption: ${result.captionPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
