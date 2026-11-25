/**
 * Подборки из готовых YouTube Shorts: 3-5 моментов в один вертикальный ролик для Instagram Reels.
 * На каждом куске сверху плашка «#N + заголовок», порядок обратный (5 → 1, лучший в конце).
 */
import * as fs from "fs";
import * as path from "path";
import { ffmpeg, probe, runCapture } from "./ffmpeg";
import { transcribeWords } from "./transcribe";
import { moderateClip } from "./moderation";
import { censorText, isSwear } from "./censor";
import { insertMidroll } from "./render";
import { CLIPS_SETTINGS } from "./config";
import {
  SHORTS_CHANNELS,
  listChannelShorts,
  downloadShort,
  fetchShortDuration,
  filterUnused,
  markUsed,
  type ShortCandidate,
} from "./shorts-source";

const W = 1080;
const H = 1920;
const FPS = 30;
const ENCODE = [
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-r", String(FPS),
  "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
  "-movflags", "+faststart",
];

export const COMPILATION_SETTINGS = {
  items: 5,
  /** Не больше N кусков с одного канала в подборке. */
  maxPerChannel: 2,
  /** Минимум просмотров у шортса. */
  minViews: 5000,
  /** Не старше N дней (дата из RSS канала). */
  maxAgeDays: 10,
  /** Кусок длиннее этого пропускаем: подборка должна быть динамичной. */
  maxItemSec: 35,
  minItemSec: 4,
  /** Ограничение длины всей подборки (без мидрола), сек. */
  maxTotalSec: 120,
  /** Длительность общего заголовка в начале, сек. */
  introSec: 2,
  /** Сколько секунд виден заголовок куска, если сверху нет свободной полосы (дальше только бейдж #N). */
  titleSec: 2.5,
  titleFont: process.env.CLIPS_TITLE_FONT || "Arial Black",
} as const;

export interface CompilationItem {
  candidate: ShortCandidate;
  sourcePath: string;
  duration: number;
  transcript: string;
  title: string;
}

export interface CompilationResult {
  outputPath: string;
  captionPath: string;
  headline: string;
  items: { rank: number; title: string; url: string; channel: string; views: number }[];
  duration: number;
}

// ---------- отбор ----------

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function collectCandidates(channelFilter?: string): Promise<ShortCandidate[]> {
  const channels = SHORTS_CHANNELS.filter(
    (c) => c.enabled && (!channelFilter || c.id === channelFilter || c.name.toLowerCase().includes(channelFilter.toLowerCase()))
  );
  if (channels.length === 0) throw new Error(`No channels match "${channelFilter}". See SHORTS_CHANNELS in lib/clips/shorts-source.ts`);

  const since = Date.now() - COMPILATION_SETTINGS.maxAgeDays * 86400000;
  const perChannel = await mapLimit(channels, 12, async (channel) => {
    try {
      const shorts = (await listChannelShorts(channel)).filter((s) => s.uploadDate.getTime() >= since);
      console.log(`  📺 ${channel.name}: ${shorts.length} fresh shorts`);
      return shorts;
    } catch (error) {
      console.log(`  ⚠️ ${channel.name}: ${(error as Error).message.slice(0, 200)}`);
      return [];
    }
  });
  return perChannel
    .flat()
    .filter((c) => c.views >= COMPILATION_SETTINGS.minViews)
    .sort((a, b) => b.score - a.score);
}

// ---------- заголовки ----------

interface Titles {
  headline: string;
  items: string[];
  caption: string;
  hashtags: string[];
}

async function generateTitles(items: { streamer: string; originalTitle: string; transcript: string }[]): Promise<Titles> {
  const fallback: Titles = {
    headline: "Топ моментов со стримов",
    items: items.map((i) => censorText(i.originalTitle.replace(/#\S+/g, "").replace(/twitch:\S+/gi, "").trim()) || i.streamer),
    caption: "Лучшие моменты со стримов за неделю",
    hashtags: ["стрим", "нарезки", "твич", "смешныемоменты"],
  };
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const list = items
      .map(
        (i, n) =>
          `Момент ${n + 1}. Стример: ${i.streamer}. Исходное название: ${i.originalTitle}\nЧто говорят: """${i.transcript.slice(0, 700)}"""`
      )
      .join("\n\n");
    const prompt = `Ты монтируешь подборку смешных моментов со стримов для Instagram Reels.
В ролике ${items.length} моментов. Над каждым моментом висит плашка с номером и коротким заголовком.

${list}

Придумай:
- items: по одному заголовку на каждый момент, в том же порядке. 2-6 слов, до 28 символов, по-русски, без эмодзи и хэштегов.
  Заголовок отражает суть момента и цепляет («Бустер сломал стул», «Эвелон не ожидал»). Имя стримера можно, если влезает.
  Не выдумывай того, чего нет в транскрипте или названии. Без мата (если цитируешь: «б***ь»).
- headline: общий заголовок подборки, до 32 символов («ТОП-5 МОМЕНТОВ НЕДЕЛИ»).
- caption: текст поста, 1-2 коротких предложения, с призывом написать в комментах, какой момент лучший.
- hashtags: 5-8 хэштегов без #, первые: ники стримеров.

Ответь строго JSON: {"headline": "...", "items": ["..."], "caption": "...", "hashtags": ["..."]}`;
    const response = await openai.chat.completions.create({
      model: process.env.CLIPS_LLM_MODEL || "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Partial<Titles>;
    if (!parsed.items || parsed.items.length !== items.length) return fallback;
    return {
      headline: censorText((parsed.headline || fallback.headline).slice(0, 40)),
      items: parsed.items.map((t, n) => censorText(String(t).slice(0, 45)) || fallback.items[n]),
      caption: censorText(parsed.caption || fallback.caption),
      hashtags: (parsed.hashtags ?? fallback.hashtags)
        .map((h) => h.replace(/^#/, "").replace(/\s+/g, ""))
        .filter((h) => h && !isSwear(h))
        .slice(0, 8),
    };
  } catch (error) {
    console.error("⚠️ Title generation failed, using fallback:", error);
    return fallback;
  }
}

// ---------- рендер ----------

function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

const assEscape = (text: string) => text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");

/** Переносит заголовок на 2 строки по словам, если он длинный. */
function wrapTitle(title: string, maxLine = 20): string {
  const words = title.split(/\s+/);
  if (title.length <= maxLine || words.length < 2) return title;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) [best, bestDiff] = [i, diff];
  }
  return `${words.slice(0, best).join(" ")}\\N${words.slice(best).join(" ")}`;
}

/**
 * Сколько пикселей сверху итогового кадра 1080x1920 не занято картинкой исходника
 * (чёрная полоса в самом шортсе или размытый фон, если исходник не 9:16). Туда плашку можно ставить без потерь.
 */
async function freeTopPx(sourcePath: string): Promise<number> {
  const info = await probe(sourcePath);
  if (!info.width || !info.height) return 0;
  // reset=0: окно копится по всем кадрам, получаем максимальную область, где когда-либо была картинка.
  const { stderr: log } = await runCapture(process.env.FFMPEG_PATH || "ffmpeg", [
    "-hide_banner", "-i", sourcePath, "-vf", "fps=2,cropdetect=limit=24:round=2:reset=0", "-an", "-f", "null", "-",
  ]).catch(() => ({ stderr: "" }));
  const matches = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  const last = matches[matches.length - 1];
  const cropY = last ? Number(last[4]) : 0;
  const scale = Math.min(W / info.width, H / info.height);
  const offsetY = (H - info.height * scale) / 2;
  return Math.max(0, Math.round(offsetY + cropY * scale));
}

const RANK_SIZE = 100;
const TITLE_SIZE = 54;
const TITLE_LINE = 70;

/**
 * Плашка куска: жёлтый номер и белый заголовок на полупрозрачной подложке.
 * - Если сверху есть свободная полоса (чёрная или размытый фон), плашка стоит в ней весь кусок.
 * - Иначе номер и заголовок видны первые titleSec секунд, потом остаётся маленький бейдж «#N» в углу.
 * Для первого куска в начале дополнительно общий заголовок подборки.
 */
function buildOverlayAss(opts: {
  rank: number;
  title: string;
  duration: number;
  font: string;
  freeTop: number;
  headline?: string;
}): string {
  const { font } = opts;
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Номер: жёлтый (&H0000D7FF = #FFD700), чёрная обводка.
    `Style: Rank,${font},${RANK_SIZE},&H0000D7FF,&H0000D7FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,3,8,40,40,0,204`,
    // Бейдж в углу после того, как заголовок ушёл.
    `Style: Badge,${font},64,&H0000D7FF,&H0000D7FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,5,2,7,0,0,0,204`,
    // Заголовок: белый на полупрозрачной чёрной подложке (BorderStyle 3 = box).
    `Style: Title,${font},${TITLE_SIZE},&H00FFFFFF,&H00FFFFFF,&H60000000,&H60000000,-1,0,0,0,100,100,0,0,3,12,0,8,60,60,0,204`,
    `Style: Headline,${font},90,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,3,8,60,60,0,204`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const title = wrapTitle(assEscape(opts.title.toUpperCase()), 22);
  const lines = title.split("\\N").length;
  const blockH = RANK_SIZE + 10 + lines * TITLE_LINE + 12;
  const inBar = opts.freeTop >= blockH + 30;
  const top = inBar ? Math.round((opts.freeTop - blockH) / 2) : 50;
  const titleY = top + RANK_SIZE + 10;

  const pop = "\\fscx60\\fscy60\\t(0,180,\\fscx112\\fscy112)\\t(180,280,\\fscx100\\fscy100)";
  const start = opts.headline ? COMPILATION_SETTINGS.introSec : 0;
  const end = opts.duration + 1;
  const titleEnd = inBar ? end : Math.min(end, start + COMPILATION_SETTINGS.titleSec);
  const fadeOut = inBar ? 0 : 250;

  const events = [
    `Dialogue: 1,${assTime(start)},${assTime(titleEnd)},Rank,,0,0,0,,{\\pos(${W / 2},${top})\\fad(150,${fadeOut})${pop}}#${opts.rank}`,
    `Dialogue: 0,${assTime(start + 0.1)},${assTime(titleEnd)},Title,,0,0,0,,{\\pos(${W / 2},${titleY})\\fad(200,${fadeOut})}${title}`,
  ];
  if (!inBar && titleEnd < end) {
    events.push(`Dialogue: 1,${assTime(titleEnd - 0.1)},${assTime(end)},Badge,,0,0,0,,{\\pos(40,40)\\fad(250,0)}#${opts.rank}`);
  }
  if (opts.headline) {
    const headlineY = inBar ? Math.max(30, Math.round((opts.freeTop - 200) / 2)) : 60;
    events.push(
      `Dialogue: 2,${assTime(0)},${assTime(COMPILATION_SETTINGS.introSec)},Headline,,0,0,0,,{\\pos(${W / 2},${headlineY})\\fad(0,200)\\c&H0000D7FF&}${wrapTitle(assEscape(opts.headline.toUpperCase()), 16)}`
    );
  }
  return [...header, ...events, ""].join("\n");
}

const filterPath = (p: string) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");

/** Приводит кусок к 1080x1920/30fps (не 9:16: размытый фон), выравнивает громкость, прожигает плашку. */
async function renderItem(item: CompilationItem, rank: number, workDir: string, headline?: string): Promise<string> {
  const assPath = path.join(workDir, `${item.candidate.videoId}-overlay.ass`);
  fs.writeFileSync(
    assPath,
    buildOverlayAss({
      rank,
      title: item.title,
      duration: item.duration,
      font: COMPILATION_SETTINGS.titleFont,
      freeTop: await freeTopPx(item.sourcePath),
      headline,
    }),
    "utf8"
  );
  const info = await probe(item.sourcePath);
  const out = path.join(workDir, `item-${rank}.mp4`);
  const video =
    `[0:v]split=2[bgsrc][fgsrc];` +
    `[bgsrc]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=25:2[bg];` +
    `[fgsrc]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${FPS},ass='${filterPath(assPath)}'[v]`;
  const audio = info.hasAudio
    ? `[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100,aformat=channel_layouts=stereo[a]`
    : `anullsrc=r=44100:cl=stereo,atrim=0:${item.duration}[a]`;
  await ffmpeg([
    "-i", item.sourcePath,
    "-filter_complex", `${video};${audio}`,
    "-map", "[v]", "-map", "[a]",
    "-t", String(item.duration),
    ...ENCODE,
    out,
  ]);
  return out;
}

async function concatItems(parts: string[], output: string, workDir: string) {
  const list = path.join(workDir, "concat.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output]);
}

// ---------- пайплайн ----------


export interface CompilationOptions {
  items?: number;
  /** Фильтр по каналу: id или часть названия. */
  channel?: string;
  noDb?: boolean;
  dryRun?: boolean;
  /** Собрать из конкретных шортсов (id видео), например чтобы пересобрать пример. */
  videoIds?: string[];
}

export async function buildCompilation(options: CompilationOptions = {}): Promise<CompilationResult | null> {
  const want = options.items ?? COMPILATION_SETTINGS.items;
  console.log(`\n🔎 Collecting shorts`);
  let candidates = await collectCandidates(options.channel);
  if (options.videoIds?.length) {
    const ids = new Set(options.videoIds);
    candidates = candidates.filter((c) => ids.has(c.videoId));
  } else if (!options.noDb) {
    candidates = await filterUnused(candidates);
  }
  console.log(`  ${candidates.length} candidates after filters`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(CLIPS_SETTINGS.outputDir, "compilations");
  const workDir = path.join(outDir, `.work-${stamp}`);
  fs.mkdirSync(workDir, { recursive: true });

  // Длительность есть только в метаданных видео (~5-30 сек на запрос): тянем пачками по 8 по мере надобности.
  const durations = new Map<number, Promise<number>>();
  const durationAt = (i: number) => {
    for (let j = i; j < Math.min(i + 8, candidates.length); j++) {
      if (!durations.has(j)) durations.set(j, fetchShortDuration(candidates[j]).catch(() => 0));
    }
    return durations.get(i)!;
  };

  const picked: CompilationItem[] = [];
  const perChannel = new Map<string, number>();
  let total = 0;

  for (const [index, candidate] of candidates.entries()) {
    if (picked.length >= want) break;
    if ((perChannel.get(candidate.channel.id) ?? 0) >= COMPILATION_SETTINGS.maxPerChannel && options.channel === undefined) continue;

    try {
      const label = `${candidate.url} (${candidate.views} views, x${candidate.score.toFixed(1)}) [${candidate.channel.name}]`;
      const meta = { duration: await durationAt(index) };
      const ageDays = (Date.now() - candidate.uploadDate.getTime()) / 86400000;
      if (meta.duration < COMPILATION_SETTINGS.minItemSec || meta.duration > COMPILATION_SETTINGS.maxItemSec) {
        console.log(`  ⏭️  ${meta.duration}s, out of ${COMPILATION_SETTINGS.minItemSec}-${COMPILATION_SETTINGS.maxItemSec}s: ${label}`);
        continue;
      }
      if (total + meta.duration > COMPILATION_SETTINGS.maxTotalSec) {
        console.log(`  ⏭️  would exceed ${COMPILATION_SETTINGS.maxTotalSec}s total: ${label}`);
        continue;
      }
      if (options.dryRun) {
        console.log(`  • ${meta.duration}s, ${Math.round(ageDays)}d old, ${label} ${candidate.title}`);
        picked.push({ candidate, sourcePath: "", duration: meta.duration, transcript: "", title: candidate.title });
        perChannel.set(candidate.channel.id, (perChannel.get(candidate.channel.id) ?? 0) + 1);
        total += meta.duration;
        continue;
      }

      console.log(`\n  ⬇️  ${label}`);
      const sourcePath = await downloadShort(candidate, workDir);
      const { duration } = await probe(sourcePath);
      const words = await transcribeWords(sourcePath, workDir);
      const transcript = words.map((w) => w.word).join(" ");
      const verdict = await moderateClip(sourcePath, transcript, workDir);
      if (verdict.flagged) {
        console.log(`  🚫 moderation: ${verdict.reasons.join(", ")}`);
        continue;
      }
      picked.push({ candidate, sourcePath, duration, transcript, title: "" });
      perChannel.set(candidate.channel.id, (perChannel.get(candidate.channel.id) ?? 0) + 1);
      total += duration;
      console.log(`  ✅ ${duration.toFixed(1)}s: "${transcript.slice(0, 80)}"`);
    } catch (error) {
      console.log(`  ⚠️ ${(error as Error).message.slice(0, 300)}`);
    }
  }

  if (options.dryRun) return null;
  if (picked.length < 3) {
    console.log(`\n⚠️ Only ${picked.length} usable shorts, need at least 3`);
    return null;
  }

  // Обратный отсчёт: самый сильный (больший score) идёт последним под номером 1.
  picked.sort((a, b) => a.candidate.score - b.candidate.score);

  console.log(`\n✍️  Generating titles`);
  const titles = await generateTitles(
    picked.map((p) => ({ streamer: p.candidate.channel.streamer, originalTitle: p.candidate.title, transcript: p.transcript }))
  );
  picked.forEach((p, i) => (p.title = titles.items[i]));

  console.log(`🎬 Rendering ${picked.length} items`);
  const parts: string[] = [];
  for (let i = 0; i < picked.length; i++) {
    const rank = picked.length - i;
    console.log(`  #${rank} ${picked[i].title}`);
    parts.push(await renderItem(picked[i], rank, workDir, i === 0 ? titles.headline : undefined));
  }

  const base = path.join(outDir, `compilation-${stamp}`);
  const joined = CLIPS_SETTINGS.midrollPath ? path.join(workDir, "joined.mp4") : `${base}.mp4`;
  await concatItems(parts, joined, workDir);
  if (CLIPS_SETTINGS.midrollPath) {
    const t = await insertMidroll(joined, CLIPS_SETTINGS.midrollPath, `${base}.mp4`);
    console.log(`  📢 midroll at ${t.toFixed(1)}s`);
  }

  const credits = picked.map((p) => `${p.candidate.channel.name}: ${p.candidate.url}`);
  const caption = [
    titles.caption,
    "",
    titles.hashtags.map((h) => `#${h}`).join(" "),
    "",
    "Источники:",
    ...credits,
  ].join("\n");
  const captionPath = `${base}.txt`;
  fs.writeFileSync(captionPath, caption, "utf8");

  if (!options.noDb) await markUsed(picked.map((p) => p.candidate), path.basename(base));
  fs.rmSync(workDir, { recursive: true, force: true });

  const { duration } = await probe(`${base}.mp4`);
  return {
    outputPath: `${base}.mp4`,
    captionPath,
    headline: titles.headline,
    items: picked.map((p, i) => ({
      rank: picked.length - i,
      title: p.title,
      url: p.candidate.url,
      channel: p.candidate.channel.name,
      views: p.candidate.views,
    })),
    duration,
  };
}
