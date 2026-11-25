/**
 * Нарезка по всплескам чата (фаза 2, см. PLAN_CLIPS.md).
 * Нужен работающий сборщик: npx tsx scripts/chat-collect.ts
 *
 *   npx tsx scripts/moments-run.ts [--streamer <login>] [--hours 24] [--limit 3] [--min-ratio 2.5] [--dry-run] [--no-db]
 */
import { config } from "dotenv";
config({ quiet: true });

import { STREAMERS } from "@/lib/clips/config";
import { findMoments } from "@/lib/clips/moments";
import { getBroadcasterId, type TwitchClip } from "@/lib/clips/twitch";
import { downloadVodSection, getArchiveVideos, locateInVods, vodUrlAt } from "@/lib/clips/vod";
import { processClip, type ClipResult } from "@/lib/clips/pipeline";
import { filterUnprocessed } from "@/lib/clips/storage";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Запись эфира отстаёт от прямого эфира: не трогаем последние минуты. */
const VOD_LAG_MS = 3 * 60 * 1000;

async function main() {
  const only = arg("streamer");
  const hours = Number(arg("hours") ?? 24);
  const limit = Number(arg("limit") ?? 3);
  const minRatio = arg("min-ratio") ? Number(arg("min-ratio")) : undefined;
  const dryRun = process.argv.includes("--dry-run");
  const noDb = process.argv.includes("--no-db");

  const to = new Date(Date.now() - VOD_LAG_MS);
  const from = new Date(Date.now() - hours * 3600 * 1000);
  const results: ClipResult[] = [];

  for (const streamer of STREAMERS.filter((s) => s.enabled && (!only || s.login === only))) {
    const moments = await findMoments(streamer.login, from, to, minRatio ? { minRatio } : {});
    if (moments.length === 0) continue;
    console.log(`\n🎮 ${streamer.login}: ${moments.length} chat spikes`);

    const id = await getBroadcasterId(streamer.login);
    if (!id) continue;
    const videos = await getArchiveVideos(id);

    // Моменты → клипы-кандидаты (формат как у Twitch-клипа, чтобы переиспользовать пайплайн и дедупликацию).
    const candidates: { clip: TwitchClip; videoId: string; startSec: number; endSec: number; hint: string }[] = [];
    for (const m of moments) {
      const startLoc = locateInVods(videos, m.start);
      if (!startLoc) {
        console.log(`  ⚠️ No VOD for ${m.peak.toISOString()}`);
        continue;
      }
      const startSec = startLoc.offset;
      const endSec = startSec + (m.end.getTime() - m.start.getTime()) / 1000;
      const peakInClip = (m.peak.getTime() - m.start.getTime()) / 1000;
      const reactionPct = Math.round(m.reaction * 100);
      candidates.push({
        videoId: startLoc.video.id,
        startSec,
        endSec,
        hint:
          `клип вырезан по всплеску чата: на ${peakInClip.toFixed(0)}-й секунде чат в ${m.ratio.toFixed(1)} раза активнее обычного ` +
          `(${reactionPct}% сообщений со смехом или шоком). Само событие обычно на 5-15 сек раньше пика чата.`,
        clip: {
          // Минутная гранулярность: повторный прогон не возьмёт тот же момент.
          id: `m-${startLoc.video.id}-${Math.floor((startSec + peakInClip) / 60)}`,
          url: vodUrlAt(startLoc.video.id, startSec),
          broadcaster_id: id,
          broadcaster_name: startLoc.video.user_login || streamer.login,
          creator_name: "chat",
          title: startLoc.video.title,
          view_count: m.users,
          created_at: m.peak.toISOString(),
          thumbnail_url: "",
          duration: endSec - startSec,
          language: "ru",
          vod_offset: Math.floor(startSec),
        },
      });
    }

    const fresh = noDb ? candidates : await filterUnprocessed(candidates.map((c) => c.clip)).then((ok) => {
      const ids = new Set(ok.map((c) => c.id));
      return candidates.filter((c) => ids.has(c.clip.id));
    });

    const top = fresh.slice(0, limit);
    for (const [i, c] of top.entries()) {
      const m = moments.find((x) => c.clip.created_at === x.peak.toISOString())!;
      console.log(
        `  ${i + 1}. ${m.peak.toISOString().slice(11, 19)} UTC  x${m.ratio.toFixed(1)}  ` +
          `реакция ${Math.round(m.reaction * 100)}%  людей ${m.users}  ${c.clip.url}`
      );
      if (dryRun) continue;
      results.push(
        await processClip(c.clip, streamer, {
          noDb,
          hint: c.hint,
          download: (workDir) => downloadVodSection(c.videoId, c.startSec, c.endSec, workDir),
        })
      );
    }
  }

  const ok = results.filter((r) => r.outputPath).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.error).length;
  console.log(`\nDone: ${ok} rendered, ${skipped} skipped, ${failed} failed`);
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
