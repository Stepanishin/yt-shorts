/**
 * Определение раскладки кадра стрима по одному кадру (vision LLM):
 * - "cam": вебка-оверлей поверх игры/экрана, возвращаем её прямоугольник;
 * - "fullcam": камера на весь экран (IRL, Just Chatting), возвращаем центр человека по X;
 * - "none": вебки не видно.
 * Позиция вебки меняется между сценами, поэтому определяем для каждого клипа, а не в конфиге.
 */
import * as fs from "fs";
import * as path from "path";
import { ffmpeg, probe } from "./ffmpeg";
import type { FacecamRect } from "./config";

export type FrameLayout =
  | { kind: "cam"; rect: FacecamRect; face?: { x: number; y: number } }
  | { kind: "fullcam"; centerX: number }
  | { kind: "none" };

const SRC_W = 1920;
const SRC_H = 1080;

/** Кадр 1920x1080 с сеткой каждые 100 px, уменьшенный до 1280x720 (сетка помогает модели с координатами). */
export async function gridFrame(videoPath: string, workDir: string, atSec?: number): Promise<string> {
  const { duration } = await probe(videoPath);
  const t = atSec ?? duration / 2;
  const out = path.join(workDir, `layout-${Math.round(t * 10)}.jpg`);
  await ffmpeg([
    "-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1",
    "-vf", `scale=${SRC_W}:${SRC_H},drawgrid=w=100:h=100:t=1:c=yellow@0.6,scale=1280:720`,
    "-q:v", "3", out,
  ]);
  return out;
}

function validRect(r: FacecamRect): boolean {
  const aspect = r.w / r.h;
  return (
    r.x >= 0 && r.y >= 0 && r.w >= 150 && r.h >= 120 &&
    r.x + r.w <= SRC_W + 5 && r.y + r.h <= SRC_H + 5 &&
    r.w <= SRC_W * 0.6 && r.h <= SRC_H * 0.7 &&
    aspect >= 0.6 && aspect <= 2.6
  );
}

async function askVision(prompt: string, imagePath: string): Promise<Record<string, unknown>> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const image = fs.readFileSync(imagePath).toString("base64");
  const response = await openai.chat.completions.create({
    model: process.env.CLIPS_VISION_MODEL || "gpt-5",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0]?.message?.content ?? "{}");
}

function toRect(r: Record<string, unknown>): FacecamRect {
  const x = Math.round(Math.max(0, Number(r.x) || 0));
  const y = Math.round(Math.max(0, Number(r.y) || 0));
  return {
    x,
    y,
    w: Math.min(Math.round(Number(r.w) || 0), SRC_W - x),
    h: Math.min(Math.round(Number(r.h) || 0), SRC_H - y),
  };
}

/** Шаг 1: тип раскладки и грубое положение вебки по всему кадру. */
export async function detectLayoutFromImage(imagePath: string): Promise<FrameLayout> {
  const prompt = `Это кадр со стрима Twitch, исходное разрешение 1920x1080. Жёлтая сетка: линии через каждые 100 пикселей исходного кадра (первая вертикальная линия x=100, первая горизонтальная y=100).

Определи раскладку:
- "cam": поверх игры или рабочего стола есть прямоугольник с веб-камерой стримера (живой человек, не персонаж игры и не реклама). Верни границы этого прямоугольника в пикселях исходного кадра 1920x1080.
- "fullcam": камера стримера занимает весь кадр или почти весь (IRL, разговорный стрим). Верни x центра лица главного человека.
- "none": живого человека с камеры нет.

Ответь строго JSON: {"kind": "cam"|"fullcam"|"none", "x": 0, "y": 0, "w": 0, "h": 0, "center_x": 0}`;

  try {
    const r = await askVision(prompt, imagePath);
    if (r.kind === "cam") {
      const rect = toRect(r);
      return validRect(rect) ? { kind: "cam", rect } : { kind: "none" };
    }
    if (r.kind === "fullcam" && typeof r.center_x === "number") {
      return { kind: "fullcam", centerX: Math.min(SRC_W, Math.max(0, r.center_x)) };
    }
    return { kind: "none" };
  } catch (error) {
    console.error("⚠️ Layout detection failed, using blur layout:", error);
    return { kind: "none" };
  }
}

/** Шаг 2: увеличенный фрагмент вокруг грубой рамки, модель уточняет границы (ошибка в 2-3 раза меньше). */
async function zoomRect(
  videoPath: string,
  workDir: string,
  rough: FacecamRect,
  atSec: number
): Promise<{ rect: FacecamRect; face?: { x: number; y: number } }> {
  const pad = Math.max(160, Math.round(Math.max(rough.w, rough.h) * 0.5));
  const x0 = Math.max(0, rough.x - pad);
  const y0 = Math.max(0, rough.y - pad);
  const x1 = Math.min(SRC_W, rough.x + rough.w + pad);
  const y1 = Math.min(SRC_H, rough.y + rough.h + pad);
  const step = 50;
  // Сетка в координатах исходного кадра: смещение первой линии внутри фрагмента.
  const gx = (step - (x0 % step)) % step;
  const gy = (step - (y0 % step)) % step;
  const out = path.join(workDir, "layout-zoom.jpg");
  await ffmpeg([
    "-ss", atSec.toFixed(2), "-i", videoPath, "-frames:v", "1",
    "-vf",
    `scale=${SRC_W}:${SRC_H},crop=${x1 - x0}:${y1 - y0}:${x0}:${y0},` +
      `drawgrid=x=${gx}:y=${gy}:w=${step}:h=${step}:t=1:c=yellow@0.5,scale='if(gt(iw,ih),1200,-2)':'if(gt(iw,ih),-2,1200)'`,
    "-q:v", "3", out,
  ]);
  const prompt = `Это увеличенный фрагмент кадра стрима 1920x1080: область от x=${x0} до x=${x1}, от y=${y0} до y=${y1} исходного кадра.
Жёлтая сетка: линии через каждые 50 пикселей исходного кадра; первая вертикальная линия x=${x0 + gx}, первая горизонтальная y=${y0 + gy}.
Во фрагменте есть прямоугольник с веб-камерой стримера (живой человек). Найди точные границы этого прямоугольника (рамку оверлея, а не только лицо) и центр лица стримера, всё в координатах ИСХОДНОГО кадра 1920x1080.
Ответь строго JSON: {"x": 0, "y": 0, "w": 0, "h": 0, "face_x": 0, "face_y": 0}`;
  try {
    const r = await askVision(prompt, out);
    const rect = toRect(r);
    const fx = Number(r.face_x);
    const fy = Number(r.face_y);
    const face = fx > 0 && fy > 0 ? { x: Math.round(fx), y: Math.round(fy) } : undefined;
    return { rect: validRect(rect) ? rect : rough, face };
  } catch {
    return { rect: rough };
  }
}

/** Серые кадры 1920x1080 (raw, 1 байт на пиксель) в нескольких точках клипа. */
async function grayFrames(videoPath: string, workDir: string, count = 5): Promise<Buffer[]> {
  const { duration } = await probe(videoPath);
  const frames: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count;
    const out = path.join(workDir, `gray-${i}.raw`);
    await ffmpeg(["-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1",
      "-vf", `scale=${SRC_W}:${SRC_H},format=gray`, "-f", "rawvideo", out]);
    if (fs.existsSync(out) && fs.statSync(out).size === SRC_W * SRC_H) frames.push(fs.readFileSync(out));
  }
  return frames;
}

/** Порог перепада яркости, который считаем краем. */
const EDGE_DIFF = 14;
/** Доля строк/столбцов с перепадом, начиная с которой линия считается рамкой оверлея. */
const EDGE_MIN_SHARE = 0.4;
const SEARCH = 70;

/**
 * Доля пикселей вдоль отрезка, где есть резкий перепад яркости поперёк него, в среднем по кадрам.
 * Рамка вебки даёт длинную прямую линию перепада во всех кадрах; края внутри игры и лица так не умеют.
 */
function edgeShare(frames: Buffer[], vertical: boolean, pos: number, from: number, to: number): number {
  let hits = 0;
  let total = 0;
  for (const f of frames) {
    for (let k = from; k < to; k += 2) {
      const a = vertical ? f[k * SRC_W + pos] : f[pos * SRC_W + k];
      const b = vertical ? f[k * SRC_W + pos - 1] : f[(pos - 1) * SRC_W + k];
      if (Math.abs(a - b) >= EDGE_DIFF) hits++;
      total++;
    }
  }
  return total ? hits / total : 0;
}

function bestEdge(frames: Buffer[], vertical: boolean, guess: number, from: number, to: number, limit: number, search = SEARCH) {
  const span = to - from;
  const inner = [from + Math.round(span * 0.15), to - Math.round(span * 0.15)] as const;
  let best = { pos: guess, share: 0 };
  for (let p = Math.max(1, guess - search); p <= Math.min(limit - 1, guess + search); p++) {
    const share = edgeShare(frames, vertical, p, inner[0], inner[1]);
    if (share > best.share) best = { pos: p, share };
  }
  return best;
}

/**
 * Уточняет грубый прямоугольник от LLM по резким прямым краям рамки вебки.
 * Если рядом с краем кадра явной рамки нет, прижимает сторону к краю кадра (вебка в углу без рамки).
 */
export function refineRect(frames: Buffer[], rough: FacecamRect): FacecamRect {
  if (frames.length === 0) return rough;
  let left = rough.x;
  let right = rough.x + rough.w;
  let top = rough.y;
  let bottom = rough.y + rough.h;

  const snap = (edge: { pos: number; share: number }, guess: number, border: number) => {
    if (edge.share >= EDGE_MIN_SHARE) return edge.pos;
    return Math.abs(guess - border) <= SEARCH ? border : guess;
  };

  for (let pass = 0; pass < 2; pass++) {
    left = snap(bestEdge(frames, true, left, top, bottom, SRC_W), left, 0);
    right = snap(bestEdge(frames, true, right, top, bottom, SRC_W), right, SRC_W);
    top = snap(bestEdge(frames, false, top, left, right, SRC_H), top, 0);
    bottom = snap(bestEdge(frames, false, bottom, left, right, SRC_H), bottom, SRC_H);
  }
  const refined = { x: left, y: top, w: right - left, h: bottom - top };
  // Если уточнение ушло в бред (схлопнулось или раздулось), оставляем ответ LLM.
  const sane = refined.w >= rough.w * 0.5 && refined.w <= rough.w * 1.8 && refined.h >= rough.h * 0.5 && refined.h <= rough.h * 1.8;
  return sane && validRect(refined) ? refined : rough;
}

export async function detectLayout(videoPath: string, workDir: string): Promise<FrameLayout> {
  const { duration } = await probe(videoPath);
  const at = duration / 2;
  const layout = await detectLayoutFromImage(await gridFrame(videoPath, workDir, at));
  if (layout.kind !== "cam") return layout;
  const zoomed = await zoomRect(videoPath, workDir, layout.rect, at);
  const frames = await grayFrames(videoPath, workDir);
  const rect = refineRect(frames, zoomed.rect);
  // Лицо вне найденной рамки: рамке не верим, берём ответ модели.
  const face = zoomed.face;
  const faceInside = !face || (face.x >= rect.x && face.x <= rect.x + rect.w && face.y >= rect.y && face.y <= rect.y + rect.h);
  return { kind: "cam", rect: faceInside ? rect : zoomed.rect, face };
}
