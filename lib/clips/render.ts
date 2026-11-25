import * as fs from "fs";
import * as path from "path";
import { ffmpeg, probe } from "./ffmpeg";
import type { Caption } from "./transcribe";
import type { FrameLayout } from "./facecam";
import { censorText } from "./censor";

const W = 1080;
const H = 1920;
const FPS = 30;
const ENCODE = [
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-r", String(FPS),
  "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
  "-movflags", "+faststart",
];

/** Высота верхней части с вебкой в раскладке "вебка сверху". */
export const CAM_H = 768;
const CAM_ASPECT = W / CAM_H;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Окно кропа вебки с пропорцией верхней части (1080x768) внутри найденной рамки,
 * центрированное на лице: если рамка определилась шире реальной, лишнее не попадёт в кадр.
 */
export function camCropWindow(layout: Extract<FrameLayout, { kind: "cam" }>) {
  const { rect, face } = layout;
  const fx = face?.x ?? rect.x + rect.w / 2;
  const fy = face?.y ?? rect.y + rect.h / 2;
  if (rect.w / rect.h > CAM_ASPECT) {
    const h = even(rect.h);
    const w = even(h * CAM_ASPECT);
    return { x: even(clamp(fx - w / 2, rect.x, rect.x + rect.w - w)), y: even(rect.y), w, h };
  }
  const w = even(rect.w);
  const h = even(w / CAM_ASPECT);
  // Лицо чуть выше центра окна: над головой меньше пустоты.
  return { x: even(rect.x), y: even(clamp(fy - h * 0.45, rect.y, rect.y + rect.h - h)), w, h };
}

/**
 * Шаг 1. Вертикальный кадр 1080x1920 в зависимости от раскладки стрима:
 * - "cam": вебка сверху (1080x768, крупно), игра снизу (1080x1152, центр кадра);
 * - "fullcam": камера на весь экран, кроп 9:16 вокруг человека;
 * - "none": размытый фон из того же видео + видео по центру.
 * Если в исходнике нет звука, добавляет тишину, чтобы дальше всегда был аудиопоток.
 */
export async function renderVertical(
  input: string,
  output: string,
  layout: FrameLayout = { kind: "none" },
  segment?: { start: number; end: number }
) {
  const info = await probe(input);
  const start = segment?.start ?? 0;
  const length = (segment?.end ?? info.duration) - start;

  let video: string;
  if (layout.kind === "cam") {
    const c = camCropWindow(layout);
    video = [
      `[0:v]scale=1920:1080,setsar=1,split[cam_src][game_src]`,
      `[cam_src]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${CAM_H}[cam]`,
      `[game_src]crop=1012:1080:(iw-1012)/2:0,scale=${W}:${H - CAM_H}[game]`,
      `[cam][game]vstack=inputs=2,fps=${FPS}[v]`,
    ].join(";");
  } else if (layout.kind === "fullcam") {
    const cw = 608; // 1080 * 9/16
    const x = even(clamp(layout.centerX - cw / 2, 0, 1920 - cw));
    video = `[0:v]scale=1920:1080,setsar=1,crop=${cw}:1080:${x}:0,scale=${W}:${H},fps=${FPS}[v]`;
  } else {
    video = [
      `[0:v]split[bg_src][fg_src]`,
      `[bg_src]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `gblur=sigma=30,eq=brightness=-0.12[bg]`,
      `[fg_src]scale=${W}:-2[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${FPS}[v]`,
    ].join(";");
  }

  // -ss/-t перед -i: быстрый поиск, при перекодировании ffmpeg режет точно по кадру.
  const args = ["-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", input];
  let audioMap = "0:a";
  if (!info.hasAudio) {
    args.push("-f", "lavfi", "-t", length.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo");
    audioMap = "1:a";
  }
  await ffmpeg([...args, "-filter_complex", video, "-map", "[v]", "-map", audioMap, "-shortest", ...ENCODE, output]);
}

/** Отступ субтитров снизу: в раскладке с вебкой ставим их на стык вебки и игры. */
export function captionMarginV(layout: FrameLayout): number {
  return layout.kind === "cam" ? H - CAM_H - 200 : 480;
}

function assTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assEscape(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");
}

export function buildAss(captions: Caption[], font: string, marginV = 480): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Белый текст, жёлтый не используем; чёрная обводка 6px, по центру снизу, отступ 480px.
    `Style: Default,${font},84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,60,60,${marginV},204`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = captions.map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(Math.max(c.end, c.start + 0.3))},Default,,0,0,0,,${assEscape(censorText(c.text)).toUpperCase()}`
  );
  return [...header, ...events, ""].join("\n");
}

/** Шаг 2. Прожигает субтитры ASS. Без титров просто копирует файл. */
export async function burnCaptions(
  input: string,
  output: string,
  captions: Caption[],
  font: string,
  workDir: string,
  marginV = 480
) {
  if (captions.length === 0) {
    fs.copyFileSync(input, output);
    return;
  }
  const assPath = path.join(workDir, `${path.basename(output, ".mp4")}.ass`);
  fs.writeFileSync(assPath, buildAss(captions, font, marginV), "utf8");
  // В фильтре ass экранируем путь: ':' и '\' и одинарные кавычки.
  const escaped = assPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  await ffmpeg(["-i", input, "-vf", `ass='${escaped}'`, ...ENCODE, output]);
}

/**
 * Точка вставки мидрола по правилам Playerok UGC:
 * - ролик ≤ 20 сек: в любой точке, кроме последних 3 сек (берём ~40% длины, но не раньше 3-й секунды);
 * - ролик > 20 сек: между 10-й и 20-й секундой (берём 10-ю).
 */
export function midrollPoint(duration: number): number {
  if (duration > 20) return 10;
  const t = Math.max(3, duration * 0.4);
  return Math.min(t, Math.max(0, duration - 3.5));
}

/**
 * Шаг 3. Мидрол: исходное видео стоит на стоп-кадре, исходный звук на паузе,
 * мидрол целиком вписан в кадр поверх стоп-кадра, затем ролик продолжается.
 */
export async function insertMidroll(input: string, midroll: string, output: string) {
  const main = await probe(input);
  const mr = await probe(midroll);
  const t = midrollPoint(main.duration);
  const frame = Math.round(t * FPS);

  const midrollAudio = mr.hasAudio
    ? `[1:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${mr.duration},asetpts=PTS-STARTPTS[am]`
    : `anullsrc=r=44100:cl=stereo,atrim=0:${mr.duration}[am]`;

  const filter = [
    `[0:v]split=3[v_a][v_f][v_b]`,
    `[0:a]asplit=2[a_a][a_b]`,
    `[v_a]trim=end_frame=${frame},setpts=PTS-STARTPTS[v1]`,
    `[a_a]atrim=end=${t},asetpts=PTS-STARTPTS[a1]`,
    // Стоп-кадр: один кадр в точке вставки, растянутый на длину мидрола.
    `[v_f]trim=start_frame=${frame}:end_frame=${frame + 1},setpts=PTS-STARTPTS,` +
      `tpad=stop_mode=clone:stop_duration=${mr.duration}[frz]`,
    `[1:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1,fps=${FPS}[mr]`,
    `[frz][mr]overlay=(W-w)/2:(H-h)/2:eof_action=pass,trim=duration=${mr.duration},setpts=PTS-STARTPTS[vm]`,
    midrollAudio,
    `[v_b]trim=start_frame=${frame},setpts=PTS-STARTPTS[v2]`,
    `[a_b]atrim=start=${t},asetpts=PTS-STARTPTS[a2]`,
    `[v1][a1][vm][am][v2][a2]concat=n=3:v=1:a=1[v][a]`,
  ].join(";");

  await ffmpeg(["-i", input, "-i", midroll, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", ...ENCODE, output]);
  return t;
}
