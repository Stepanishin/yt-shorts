import { ObjectId } from "mongodb";
import { generateScript } from "./script-generator";
import { generateSceneTTS } from "./tts-generator";
import { generateSubtitles, generateSubtitlesFromScenes } from "./subtitle-generator";
import { findImagesForScenes, downloadImage } from "./image-sourcer";
import { renderLongformVideo, assignKenBurnsEffects } from "./video-renderer";
import { generateThumbnail } from "./thumbnail-generator";
import { generateLongformMetadata } from "./metadata-generator";
import { addScheduledVideo } from "@/lib/db/users";
import { selectRandomFromArray } from "@/lib/auto-generation/audio-processor";
import * as fs from "fs";

export interface LongformGenerationOptions {
  userId: string;
  celebrityName: string;
  context?: string; // what the viral Short was about
  backgroundMusicUrls?: string[];
  backgroundMusicVolume?: number;
  ttsVoice?: "onyx" | "nova" | "alloy";
  scheduledAt: Date;
  youtubeChannelId?: string;
  youtubePrivacyStatus?: "public" | "private" | "unlisted";
}

export interface LongformGenerationResult {
  jobId: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  duration: number;
  scenesCount: number;
}

/**
 * Main orchestrator: generates a complete long-form biographical video.
 *
 * Flow:
 * 1. Generate script (GPT-5)
 * 2. Generate TTS audio per scene (OpenAI TTS)
 * 3. Generate subtitles (Whisper or scene-based)
 * 4. Find images for each scene (Google/Wikimedia scraping)
 * 5. Download images
 * 6. Render video (FFmpeg)
 * 7. Generate thumbnail (Canvas)
 * 8. Generate YouTube metadata (GPT)
 * 9. Schedule upload
 */
export async function generateLongformVideo(
  options: LongformGenerationOptions
): Promise<LongformGenerationResult> {
  const jobId = new ObjectId().toString();
  const {
    userId,
    celebrityName,
    context,
    backgroundMusicUrls,
    backgroundMusicVolume = 0.15,
    ttsVoice = "onyx",
    scheduledAt,
    youtubeChannelId,
    youtubePrivacyStatus = "public",
  } = options;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎬 LONGFORM VIDEO GENERATION: ${celebrityName}`);
  console.log(`Job ID: ${jobId}`);
  console.log(`${"=".repeat(60)}\n`);

  const tempFiles: string[] = []; // Track temp files for cleanup

  try {
    // ==================== STEP 1: Generate Script ====================
    console.log(`[${jobId}] Step 1/9: Generating script...`);
    const script = await generateScript(celebrityName, context);
    console.log(`Script: ${script.scenes.length} scenes, ~${script.totalWordCount} words\n`);

    // ==================== STEP 2: Generate TTS ====================
    console.log(`[${jobId}] Step 2/9: Generating TTS audio...`);
    const ttsResult = await generateSceneTTS(script.scenes, {
      voice: ttsVoice,
      jobId,
    });
    tempFiles.push(ttsResult.fullAudioPath);
    console.log(`TTS: ${ttsResult.totalDuration.toFixed(1)}s total\n`);

    // ==================== STEP 3: Generate Subtitles ====================
    console.log(`[${jobId}] Step 3/9: Generating subtitles...`);
    let subtitles;
    try {
      subtitles = await generateSubtitles(ttsResult.fullAudioPath);
    } catch (e) {
      console.warn("Whisper failed, using scene-based subtitles:", (e as Error).message);
      subtitles = generateSubtitlesFromScenes(
        script.scenes.map((s, i) => ({
          narrationText: s.narrationText,
          startTime: ttsResult.sceneDurations[i].startTime,
          endTime: ttsResult.sceneDurations[i].endTime,
        }))
      );
    }
    console.log(`Subtitles: ${subtitles.length} segments\n`);

    // ==================== STEP 4: Find Images ====================
    // Request 2 images per scene for ~15s each photo
    console.log(`[${jobId}] Step 4/9: Finding images (2 per scene)...`);
    const expandedScenes = script.scenes.flatMap((s) => [
      { sceneNumber: s.sceneNumber * 10, imageSearchQuery: s.imageSearchQuery },
      { sceneNumber: s.sceneNumber * 10 + 1, imageSearchQuery: `${celebrityName} ${s.imageSearchQuery.split(" ").slice(-2).join(" ")}` },
    ]);
    const images = await findImagesForScenes(expandedScenes, celebrityName);
    console.log();

    // ==================== STEP 5: Download Images ====================
    console.log(`[${jobId}] Step 5/9: Downloading images...`);
    const imagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      if (!images[i].url) {
        imagePaths.push(imagePaths[Math.max(0, i - 1)] || "");
        continue;
      }
      try {
        const localPath = await downloadImage(images[i].url, jobId, i);
        imagePaths.push(localPath);
        tempFiles.push(localPath);
      } catch (e) {
        console.warn(`  Failed to download image ${i}:`, (e as Error).message);
        imagePaths.push(imagePaths[Math.max(0, i - 1)] || "");
      }
    }
    console.log(`Downloaded ${imagePaths.filter(Boolean).length} images\n`);

    // ==================== STEP 6: Render Video ====================
    console.log(`[${jobId}] Step 6/9: Rendering video...`);

    // Split each scene into 2 sub-clips with different images (~15s each)
    const renderScenes: { imagePath: string; duration: number; sceneNumber: number; kenBurnsEffect: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" }[] = [];
    let imgIdx = 0;

    for (let i = 0; i < script.scenes.length; i++) {
      const sceneDuration = ttsResult.sceneDurations[i].duration;
      const subDuration = sceneDuration / 2;

      for (let j = 0; j < 2; j++) {
        const img = imagePaths[imgIdx] || imagePaths[Math.max(0, imgIdx - 1)] || imagePaths[0];
        renderScenes.push({
          imagePath: img,
          duration: subDuration,
          sceneNumber: renderScenes.length + 1,
          kenBurnsEffect: assignKenBurnsEffects(1)[0],
        });
        imgIdx++;
      }
    }

    // Assign varied Ken Burns effects across all sub-clips
    const allEffects = assignKenBurnsEffects(renderScenes.length);
    renderScenes.forEach((s, i) => { s.kenBurnsEffect = allEffects[i]; });

    // Prepare background music — concatenate 2-3 random tracks
    let bgMusicPath: string | undefined;
    if (backgroundMusicUrls && backgroundMusicUrls.length > 0) {
      try {
        bgMusicPath = await downloadAndConcatMusic(backgroundMusicUrls, ttsResult.totalDuration, jobId);
        tempFiles.push(bgMusicPath);
      } catch (e) {
        console.warn("Failed to prepare background music:", (e as Error).message);
      }
    }

    const renderResult = await renderLongformVideo({
      scenes: renderScenes,
      ttsAudioPath: ttsResult.fullAudioPath,
      subtitles,
      backgroundMusicPath: bgMusicPath,
      backgroundMusicVolume,
      jobId,
    });
    console.log(`Video: ${renderResult.duration.toFixed(1)}s\n`);

    // ==================== STEP 7: Generate Thumbnail ====================
    console.log(`[${jobId}] Step 7/9: Generating thumbnail...`);
    // Extract a short hook from the video title for thumbnail
    const hookText = script.videoTitle
      .replace(celebrityName, "")
      .replace(/^[\s:—\-]+/, "")
      .toUpperCase()
      .substring(0, 35) || "LO QUE NADIE TE CONTÓ";

    const thumbnail = await generateThumbnail(
      imagePaths[0] || imagePaths.find(Boolean) || "",
      celebrityName,
      jobId,
      hookText
    );
    tempFiles.push(thumbnail.localPath);
    console.log();

    // ==================== STEP 8: Generate Metadata ====================
    console.log(`[${jobId}] Step 8/9: Generating YouTube metadata...`);
    const scenesWithTimes = script.scenes.map((s, i) => ({
      ...s,
      startTime: ttsResult.sceneDurations[i].startTime,
    }));
    const metadata = await generateLongformMetadata(
      celebrityName,
      scenesWithTimes,
      script.videoTitle
    );
    console.log();

    // ==================== STEP 9: Schedule Upload ====================
    console.log(`[${jobId}] Step 9/9: Scheduling YouTube upload...`);
    await addScheduledVideo(userId, {
      videoUrl: renderResult.videoUrl,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      privacyStatus: youtubePrivacyStatus,
      scheduledAt,
      youtubeChannelId,
      thumbnailUrl: thumbnail.thumbnailUrl,
      language: "es",
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ LONGFORM VIDEO GENERATED SUCCESSFULLY`);
    console.log(`Celebrity: ${celebrityName}`);
    console.log(`Title: ${metadata.title}`);
    console.log(`Duration: ${renderResult.duration.toFixed(1)}s`);
    console.log(`Scenes: ${script.scenes.length}`);
    console.log(`Scheduled: ${scheduledAt.toISOString()}`);
    console.log(`${"=".repeat(60)}\n`);

    return {
      jobId,
      videoUrl: renderResult.videoUrl,
      thumbnailUrl: thumbnail.thumbnailUrl,
      title: metadata.title,
      duration: renderResult.duration,
      scenesCount: script.scenes.length,
    };
  } catch (error) {
    console.error(`\n❌ LONGFORM GENERATION FAILED: ${(error as Error).message}`);
    throw error;
  } finally {
    // Cleanup temp files
    for (const file of tempFiles) {
      try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
  }
}

/**
 * Download 2-3 random music tracks and concatenate them to cover the target duration.
 */
async function downloadAndConcatMusic(
  urls: string[],
  targetDuration: number,
  jobId: string
): Promise<string> {
  const pathMod = await import("path");
  const osMod = await import("os");
  const { execWithFFmpegEnv } = await import("@/lib/video/renderer-new");

  // Pick 2-3 random tracks
  const shuffled = [...urls].sort(() => Math.random() - 0.5);
  const trackCount = Math.min(3, shuffled.length);
  const selectedUrls = shuffled.slice(0, trackCount);

  console.log(`🎵 Downloading ${trackCount} background music tracks...`);

  const trackPaths: string[] = [];
  for (let i = 0; i < selectedUrls.length; i++) {
    const trackPath = pathMod.join(osMod.tmpdir(), `longform_music_${jobId}_${i}.mp3`);
    const response = await fetch(selectedUrls[i]);
    if (!response.ok) {
      console.warn(`  Failed to download track ${i}: ${response.status}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(trackPath, buffer);
    trackPaths.push(trackPath);
    console.log(`  ✅ Track ${i + 1}: ${decodeURIComponent(selectedUrls[i].split("/").pop() || "")}`);
  }

  if (trackPaths.length === 0) {
    throw new Error("No music tracks downloaded");
  }

  // Concatenate tracks
  const concatPath = pathMod.join(osMod.tmpdir(), `longform_bgmusic_${jobId}.mp3`);

  if (trackPaths.length === 1) {
    fs.copyFileSync(trackPaths[0], concatPath);
  } else {
    const listPath = concatPath + ".list.txt";
    const listContent = trackPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(listPath, listContent);

    await execWithFFmpegEnv(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${concatPath}"`
    );

    try { fs.unlinkSync(listPath); } catch {}
  }

  // Cleanup individual tracks
  for (const p of trackPaths) {
    try { fs.unlinkSync(p); } catch {}
  }

  console.log(`✅ Background music ready (${trackCount} tracks concatenated)`);
  return concatPath;
}
