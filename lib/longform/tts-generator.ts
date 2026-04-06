import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { uploadVideoToSpaces, isSpacesConfigured } from "@/lib/storage/spaces-client";

/**
 * Generate TTS audio from text using OpenAI TTS API.
 * Returns URL to the audio file (Spaces or local).
 */
export async function generateTTSAudio(
  text: string,
  options: {
    voice?: "onyx" | "nova" | "alloy" | "echo" | "fable" | "shimmer";
    model?: "tts-1" | "tts-1-hd";
    jobId: string;
  }
): Promise<{ audioUrl: string; localPath: string; durationSeconds: number }> {
  const { voice = "onyx", model = "tts-1-hd", jobId } = options;

  console.log(`🎙️ Generating TTS audio (${model}, voice: ${voice}, ${text.length} chars)...`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: "mp3",
    speed: 0.95, // Slightly slower for dramatic effect
  });

  // Save to temp file
  const tmpDir = os.tmpdir();
  const localPath = path.join(tmpDir, `longform_tts_${jobId}.mp3`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(localPath, buffer);

  console.log(`✅ TTS audio saved: ${localPath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

  // Get duration via ffprobe
  const durationSeconds = await getAudioDuration(localPath);
  console.log(`⏱️ Audio duration: ${durationSeconds.toFixed(1)}s`);

  // Upload to Spaces if configured
  let audioUrl = localPath;
  if (isSpacesConfigured()) {
    audioUrl = await uploadVideoToSpaces({
      filePath: localPath,
      fileName: `longform/audio/${jobId}.mp3`,
      contentType: "audio/mpeg",
    });
  }

  return { audioUrl, localPath, durationSeconds };
}

/**
 * Generate TTS for each scene separately to get per-scene durations
 */
export async function generateSceneTTS(
  scenes: { sceneNumber: number; narrationText: string }[],
  options: {
    voice?: "onyx" | "nova" | "alloy" | "echo" | "fable" | "shimmer";
    model?: "tts-1" | "tts-1-hd";
    jobId: string;
  }
): Promise<{
  fullAudioPath: string;
  fullAudioUrl: string;
  totalDuration: number;
  sceneDurations: { sceneNumber: number; startTime: number; endTime: number; duration: number }[];
}> {
  const { voice = "onyx", model = "tts-1-hd", jobId } = options;
  const tmpDir = os.tmpdir();

  console.log(`🎙️ Generating TTS for ${scenes.length} scenes...`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const sceneAudioPaths: string[] = [];
  const sceneDurations: { sceneNumber: number; startTime: number; endTime: number; duration: number }[] = [];
  let currentTime = 0;

  for (const scene of scenes) {
    console.log(`  Scene ${scene.sceneNumber}: ${scene.narrationText.length} chars...`);

    // Force Spanish pronunciation by wrapping text in Spanish context.
    // This prevents the TTS from switching to English on foreign names.
    const spanishInput = `[Habla en español de España, con acento castellano.] ${scene.narrationText}`;

    const response = await openai.audio.speech.create({
      model,
      voice,
      input: spanishInput,
      response_format: "mp3",
      speed: 0.95,
    });

    const scenePath = path.join(tmpDir, `longform_scene_${jobId}_${scene.sceneNumber}.mp3`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(scenePath, buffer);

    const duration = await getAudioDuration(scenePath);

    sceneDurations.push({
      sceneNumber: scene.sceneNumber,
      startTime: currentTime,
      endTime: currentTime + duration,
      duration,
    });

    currentTime += duration;
    sceneAudioPaths.push(scenePath);

    console.log(`  ✅ Scene ${scene.sceneNumber}: ${duration.toFixed(1)}s`);
  }

  // Concatenate all scene audio files into one
  const fullAudioPath = path.join(tmpDir, `longform_full_${jobId}.mp3`);
  await concatenateAudioFiles(sceneAudioPaths, fullAudioPath);

  const totalDuration = currentTime;
  console.log(`✅ Full TTS audio: ${totalDuration.toFixed(1)}s (${scenes.length} scenes)`);

  // Upload to Spaces
  let fullAudioUrl = fullAudioPath;
  if (isSpacesConfigured()) {
    fullAudioUrl = await uploadVideoToSpaces({
      filePath: fullAudioPath,
      fileName: `longform/audio/${jobId}_full.mp3`,
      contentType: "audio/mpeg",
    });
  }

  // Cleanup scene audio files
  for (const p of sceneAudioPaths) {
    try { fs.unlinkSync(p); } catch {}
  }

  return { fullAudioPath, fullAudioUrl, totalDuration, sceneDurations };
}

async function getAudioDuration(filePath: string): Promise<number> {
  const { execWithFFmpegEnv } = await import("@/lib/video/renderer-new");

  const { stdout } = await execWithFFmpegEnv(
    `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`
  );
  return parseFloat(stdout.trim()) || 0;
}

async function concatenateAudioFiles(inputPaths: string[], outputPath: string): Promise<void> {
  const { execWithFFmpegEnv } = await import("@/lib/video/renderer-new");

  const listPath = outputPath + ".list.txt";
  const listContent = inputPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listPath, listContent);

  await execWithFFmpegEnv(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`
  );

  try { fs.unlinkSync(listPath); } catch {}
}
