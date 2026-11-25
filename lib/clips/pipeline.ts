import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CLIPS_SETTINGS, STREAMERS, type StreamerConfig } from "./config";
import { getBroadcasterId, getTopClips, type TwitchClip } from "./twitch";
import { filterUnprocessed, saveClipResult } from "./storage";
import { downloadClip } from "./download";
import { groupWords, transcribeWords } from "./transcribe";
import { burnCaptions, captionMarginV, insertMidroll, renderVertical } from "./render";
import { detectLayout, type FrameLayout } from "./facecam";
import { generatePostText } from "./title";
import { moderateClip } from "./moderation";
import { chooseSegment, shiftWords } from "./trim";
import { probe } from "./ffmpeg";

export interface RunOptions {
  /** Только этот стример (login). */
  streamer?: string;
  /** Лимит клипов на стримера. */
  limit?: number;
  /** Только показать, какие клипы были бы взяты. */
  dryRun?: boolean;
  /** Не писать в MongoDB (для локальных тестов). */
  noDb?: boolean;
}

export interface ClipResult {
  clipId: string;
  streamer: string;
  outputPath?: string;
  error?: string;
  /** Причина пропуска (например, модерация). */
  skipped?: string;
}

function selectClips(clips: TwitchClip[], streamer: StreamerConfig, limit: number): TwitchClip[] {
  const minViews = streamer.minClipViews ?? CLIPS_SETTINGS.defaultMinClipViews;
  return clips
    .filter((c) => c.view_count >= minViews)
    .filter((c) => c.duration >= CLIPS_SETTINGS.minDurationSec && c.duration <= CLIPS_SETTINGS.maxDurationSec)
    .sort((a, b) => b.view_count - a.view_count)
    .slice(0, limit);
}

/** Полный цикл для одного клипа: скачать → вертикаль → субтитры → мидрол → текст поста. */
export async function processClip(
  clip: TwitchClip,
  streamer: StreamerConfig,
  opts: {
    noDb?: boolean;
    /** Своё скачивание исходника (например, кусок записи эфира). По умолчанию yt-dlp по clip.url. */
    download?: (workDir: string) => Promise<string>;
    /** Подсказка для LLM при выборе отрезка (например, где был пик реакции чата). */
    hint?: string;
  } = {}
): Promise<ClipResult> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `clip-${clip.id}-`));
  const day = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(CLIPS_SETTINGS.outputDir, day);
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${streamer.login}-${clip.id}.mp4`);

  try {
    console.log(`  ⬇️  ${clip.id} (${clip.view_count} views, ${clip.duration}s): ${clip.title}`);
    const source = opts.download ? await opts.download(workDir) : await downloadClip(clip.url, clip.id, workDir);
    const words = await transcribeWords(source, workDir, "ru");

    const verdict = await moderateClip(source, words.map((w) => w.word).join(" "), workDir);
    if (verdict.flagged) {
      const reason = `moderation: ${verdict.reasons.join(", ")}`;
      console.log(`  🚫 Skipped (${reason})`);
      if (!opts.noDb) await saveClipResult(clip, streamer.login, { status: "skipped", error: reason });
      return { clipId: clip.id, streamer: streamer.login, skipped: reason };
    }

    const { duration } = await probe(source);
    const segment = await chooseSegment({
      words,
      duration,
      clipTitle: clip.title,
      streamer: clip.broadcaster_name,
      hint: opts.hint,
    });
    console.log(
      `  ✂️  ${segment.method}: ${segment.start.toFixed(1)}-${segment.end.toFixed(1)}s of ${duration.toFixed(1)}s` +
        (segment.reason ? ` (${segment.reason})` : "")
    );
    const segmentWords = shiftWords(words, segment);

    const layout: FrameLayout = streamer.facecam ? { kind: "cam", rect: streamer.facecam } : await detectLayout(source, workDir);
    console.log(`  🎥 layout: ${layout.kind}${layout.kind === "cam" ? ` ${JSON.stringify(layout.rect)}` : ""}`);

    const vertical = path.join(workDir, "vertical.mp4");
    await renderVertical(source, vertical, layout, segment);

    const captioned = path.join(workDir, "captioned.mp4");
    await burnCaptions(vertical, captioned, groupWords(segmentWords), CLIPS_SETTINGS.subtitleFont, workDir, captionMarginV(layout));

    let hasMidroll = false;
    if (CLIPS_SETTINGS.midrollPath && fs.existsSync(CLIPS_SETTINGS.midrollPath)) {
      const at = await insertMidroll(captioned, CLIPS_SETTINGS.midrollPath, outputPath);
      console.log(`  📢 Midroll inserted at ${at.toFixed(1)}s`);
      hasMidroll = true;
    } else {
      fs.copyFileSync(captioned, outputPath);
    }

    const post = await generatePostText({
      streamer: clip.broadcaster_name,
      clipTitle: clip.title,
      transcript: segmentWords.map((w) => w.word).join(" "),
    });
    const postFile = outputPath.replace(/\.mp4$/, ".txt");
    fs.writeFileSync(
      postFile,
      [
        post.title,
        "",
        post.description,
        "",
        post.hashtags.map((h) => `#${h}`).join(" "),
        "",
        `Источник: ${clip.url}`,
        `Отрезок: ${segment.start.toFixed(1)}-${segment.end.toFixed(1)}s (${segment.method})`,
        hasMidroll ? "Мидрол Playerok: да" : "Мидрол Playerok: нет",
      ].join("\n"),
      "utf8"
    );

    if (!opts.noDb) {
      await saveClipResult(clip, streamer.login, {
        status: "rendered",
        outputPath,
        postTitle: post.title,
        postDescription: post.description,
        hasMidroll,
      });
    }
    console.log(`  ✅ ${outputPath}`);
    return { clipId: clip.id, streamer: streamer.login, outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ ${clip.id}: ${message}`);
    if (!opts.noDb) {
      await saveClipResult(clip, streamer.login, { status: "failed", error: message.slice(0, 1000) });
    }
    return { clipId: clip.id, streamer: streamer.login, error: message };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export async function runClipsPipeline(options: RunOptions = {}): Promise<ClipResult[]> {
  const streamers = STREAMERS.filter((s) => s.enabled && (!options.streamer || s.login === options.streamer));
  if (streamers.length === 0) {
    console.log("⚠️ No enabled streamers. Add them to lib/clips/config.ts or pass --streamer with a configured login.");
    return [];
  }

  const since = new Date(Date.now() - CLIPS_SETTINGS.lookbackHours * 3600 * 1000);
  const limit = options.limit ?? CLIPS_SETTINGS.perStreamerLimit;
  const results: ClipResult[] = [];

  for (const streamer of streamers) {
    console.log(`\n🎮 ${streamer.login}`);
    const id = await getBroadcasterId(streamer.login);
    if (!id) {
      console.log(`  ⚠️ Twitch user not found: ${streamer.login}`);
      continue;
    }
    const clips = await getTopClips(id, since, 100);
    const fresh = options.noDb ? clips : await filterUnprocessed(clips);
    const selected = selectClips(fresh, streamer, limit);
    console.log(`  ${clips.length} clips found, ${fresh.length} new, ${selected.length} selected`);

    for (const clip of selected) {
      if (options.dryRun) {
        console.log(`  • ${clip.view_count} views, ${clip.duration}s: ${clip.title} (${clip.url})`);
        continue;
      }
      results.push(await processClip(clip, streamer, { noDb: options.noDb }));
    }
  }
  return results;
}
