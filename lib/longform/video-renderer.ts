import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { uploadVideoToSpaces, isSpacesConfigured } from "@/lib/storage/spaces-client";
import { Subtitle } from "./subtitle-generator";

const execAsync = promisify(exec);

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 25;
const CROSSFADE_DURATION = 0.5;

// Font paths (same as renderer-new.ts)
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/HelveticaNeue.ttc",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
];

function findFont(): string {
  for (const f of FONT_CANDIDATES) {
    if (fs.existsSync(f)) return f;
  }
  return "sans-serif";
}

interface RenderSceneInput {
  imagePath: string;
  duration: number; // seconds
  sceneNumber: number;
  kenBurnsEffect: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
}

interface RenderLongformOptions {
  scenes: RenderSceneInput[];
  ttsAudioPath: string;
  subtitles: Subtitle[];
  backgroundMusicPath?: string;
  backgroundMusicVolume?: number; // 0.0-1.0, default 0.15
  jobId: string;
}

/**
 * Render a long-form video from scene images + TTS audio + subtitles.
 *
 * Pipeline:
 * 1. Generate per-scene video clips (image + Ken Burns)
 * 2. Concatenate all scene clips with crossfades
 * 3. Overlay subtitles
 * 4. Mix TTS audio + background music
 * 5. Output final MP4
 */
export async function renderLongformVideo(
  options: RenderLongformOptions
): Promise<{ videoUrl: string; localPath: string; duration: number }> {
  const {
    scenes,
    ttsAudioPath,
    subtitles,
    backgroundMusicPath,
    backgroundMusicVolume = 0.15,
    jobId,
  } = options;

  const tmpDir = os.tmpdir();
  const font = findFont();

  console.log(`🎬 Rendering long-form video (${scenes.length} scenes)...`);

  // Step 1: Generate scene clips
  const sceneClipPaths: string[] = [];
  for (const scene of scenes) {
    const clipPath = path.join(tmpDir, `longform_clip_${jobId}_${scene.sceneNumber}.mp4`);
    await renderSceneClip(scene, clipPath);
    sceneClipPaths.push(clipPath);
  }

  // Step 2: Concatenate scenes
  console.log(`🔗 Concatenating ${sceneClipPaths.length} scene clips...`);
  const concatPath = path.join(tmpDir, `longform_concat_${jobId}.mp4`);
  await concatenateSceneClips(sceneClipPaths, concatPath);

  // Step 3: Add subtitles + audio
  console.log(`📝 Adding subtitles and audio...`);
  const finalPath = path.join(tmpDir, `longform_final_${jobId}.mp4`);
  await addSubtitlesAndAudio({
    videoPath: concatPath,
    ttsAudioPath,
    backgroundMusicPath,
    backgroundMusicVolume,
    subtitles,
    font,
    outputPath: finalPath,
  });

  // Get final duration
  const { stdout } = await execAsync(
    `ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`
  );
  const duration = parseFloat(stdout.trim()) || 0;

  console.log(`✅ Video rendered: ${duration.toFixed(1)}s, ${finalPath}`);

  // Upload to Spaces
  let videoUrl = finalPath;
  if (isSpacesConfigured()) {
    videoUrl = await uploadVideoToSpaces({
      filePath: finalPath,
      fileName: `longform/videos/${jobId}.mp4`,
    });
  }

  // Cleanup temp files
  for (const p of sceneClipPaths) {
    try { fs.unlinkSync(p); } catch {}
  }
  try { fs.unlinkSync(concatPath); } catch {}

  return { videoUrl, localPath: finalPath, duration };
}

/**
 * Render a single scene: image + Ken Burns effect → short video clip.
 * Crops with face bias (upper third of image) to avoid cutting off heads.
 */
async function renderSceneClip(
  scene: RenderSceneInput,
  outputPath: string
): Promise<void> {
  const { imagePath, duration, sceneNumber, kenBurnsEffect } = scene;
  const totalFrames = Math.ceil(duration * FPS);

  // Y position biased toward upper part of image where faces typically are.
  // ih/3 instead of ih/2 keeps faces in frame for portrait photos.
  const yFocus = "ih/3-(ih/zoom/3)";

  let zoompanFilter: string;
  switch (kenBurnsEffect) {
    case "zoom-in":
      zoompanFilter = `zoompan=z='min(zoom+0.001,1.25)':x='iw/2-(iw/zoom/2)':y='${yFocus}':d=${totalFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
      break;
    case "zoom-out":
      zoompanFilter = `zoompan=z='if(eq(on,1),1.25,max(zoom-0.001,1.0))':x='iw/2-(iw/zoom/2)':y='${yFocus}':d=${totalFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
      break;
    case "pan-left":
      zoompanFilter = `zoompan=z='1.15':x='iw/2-(iw/zoom/2)-80+160*on/${totalFrames}':y='${yFocus}':d=${totalFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
      break;
    case "pan-right":
      zoompanFilter = `zoompan=z='1.15':x='iw/2-(iw/zoom/2)+80-160*on/${totalFrames}':y='${yFocus}':d=${totalFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
      break;
  }

  // Scale up, crop from TOP (y=0) to keep faces, then apply Ken Burns
  const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -vf "scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase,crop=${WIDTH * 2}:${HEIGHT * 2}:0:0,${zoompanFilter}" -t ${duration} -c:v libx264 -preset fast -pix_fmt yuv420p -an "${outputPath}"`;

  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Concatenate scene clips using FFmpeg concat demuxer
 */
async function concatenateSceneClips(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  const listPath = outputPath + ".list.txt";
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listPath, listContent);

  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -pix_fmt yuv420p "${outputPath}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  );

  try { fs.unlinkSync(listPath); } catch {}
}

/**
 * Add subtitles and mix TTS + background music onto the concatenated video
 */
async function addSubtitlesAndAudio(options: {
  videoPath: string;
  ttsAudioPath: string;
  backgroundMusicPath?: string;
  backgroundMusicVolume: number;
  subtitles: Subtitle[];
  font: string;
  outputPath: string;
}): Promise<void> {
  const {
    videoPath,
    ttsAudioPath,
    backgroundMusicPath,
    backgroundMusicVolume,
    subtitles,
    font,
    outputPath,
  } = options;

  // Write subtitles as SRT file — much more reliable than drawtext chains
  const srtPath = outputPath + ".srt";
  const srtContent = subtitles
    .map((sub, i) => {
      // Wrap long lines at ~45 chars to prevent overflow
      const wrapped = wrapText(sub.text, 45);
      return `${i + 1}\n${formatSRT(sub.start)} --> ${formatSRT(sub.end)}\n${wrapped}\n`;
    })
    .join("\n");
  fs.writeFileSync(srtPath, srtContent, "utf-8");

  // Use ASS subtitles filter for better styling control
  // subtitles filter handles word wrap and positioning automatically
  const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const subtitleFilter = `subtitles='${escapedSrtPath}':force_style='FontSize=22,FontName=Arial,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=60'`;

  let cmd: string;

  if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
    const musicVolume = backgroundMusicVolume.toFixed(2);
    cmd = `ffmpeg -y -i "${videoPath}" -i "${ttsAudioPath}" -i "${backgroundMusicPath}" -filter_complex "[1:a]volume=1.0[tts];[2:a]volume=${musicVolume},aloop=loop=-1:size=2e+09[music];[tts][music]amix=inputs=2:duration=shortest[aout];[0:v]${subtitleFilter}[vout]" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -c:a aac -b:a 192k -shortest "${outputPath}"`;
  } else {
    cmd = `ffmpeg -y -i "${videoPath}" -i "${ttsAudioPath}" -filter_complex "[0:v]${subtitleFilter}[vout]" -map "[vout]" -map 1:a -c:v libx264 -preset fast -c:a aac -b:a 192k -shortest "${outputPath}"`;
  }

  await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024, timeout: 600000 });

  // Cleanup SRT
  try { fs.unlinkSync(srtPath); } catch {}
}

/**
 * Select Ken Burns effect for each scene, alternating for variety
 */
export function assignKenBurnsEffects(
  sceneCount: number
): ("zoom-in" | "zoom-out" | "pan-left" | "pan-right")[] {
  const effects: ("zoom-in" | "zoom-out" | "pan-left" | "pan-right")[] = [
    "zoom-in",
    "pan-right",
    "zoom-out",
    "pan-left",
  ];
  return Array.from({ length: sceneCount }, (_, i) => effects[i % effects.length]);
}

/**
 * Wrap text at ~maxChars to prevent subtitle overflow
 */
function wrapText(text: string, maxChars: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);

  return lines.join("\n");
}

function formatSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}
