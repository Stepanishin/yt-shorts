/**
 * Ищет активные каналы-нарезчики для подборок и печатает топ.
 *
 *   npx tsx scripts/shorts-discover.ts [--days 14] [--min-shorts 5] [--min-views 3000] [--out file.json]
 *
 * Найденное вручную переносим в SHORTS_CHANNELS (lib/clips/shorts-source.ts).
 */
import { config } from "dotenv";
config();

import * as fs from "fs";
import { discoverChannels } from "@/lib/clips/shorts-discover";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const minShorts = Number(arg("min-shorts", "5"));
  const minViews = Number(arg("min-views", "3000"));
  const all = await discoverChannels({ windowDays: Number(arg("days", "14")) });
  const good = all.filter((c) => c.freshShorts >= minShorts && c.medianViews >= minViews);

  console.log(`\n${good.length} channels with ≥${minShorts} fresh shorts and median ≥${minViews} views:\n`);
  for (const c of good) {
    console.log(
      `${String(c.score).padStart(8)}  ${String(c.freshShorts).padStart(2)} shorts  median ${String(c.medianViews).padStart(7)}  max ${String(c.maxViews).padStart(8)}  last ${c.lastUpload}  ${c.id}  ${c.name}`
    );
  }
  const out = arg("out");
  if (out) {
    fs.writeFileSync(out, JSON.stringify(all, null, 2));
    console.log(`\nFull list: ${out}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
