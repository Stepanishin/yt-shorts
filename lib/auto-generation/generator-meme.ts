import { ObjectId } from "mongodb";
import {
  getMemeAutoGenerationConfig,
  createMemeAutoGenerationJob,
  updateMemeJobStatus,
  incrementMemeGeneratedCount,
  MemeAutoGenerationJob,
} from "@/lib/db/auto-generation-meme";
import { addScheduledVideo } from "@/lib/db/users";
import { markRedditMemeStatus } from "@/lib/ingest-reddit/storage";
import { selectNextMeme, getAvailableMemesCount } from "./meme-selector";
import { prepareAudioCut, selectRandomFromArray } from "./audio-processor";
import { renderVideoNew } from "@/lib/video/renderer-new";
import { generateMemeShortsTitle, generateMemeShortsDescription } from "@/lib/youtube/meme-title-generator";

/**
 * Main function to generate auto video from meme
 * @param userId - User ID
 * @param configId - Auto-generation config ID
 * @param scheduledAt - Scheduled publish time
 * @returns Created job
 */
export async function generateAutoVideoMeme(
  userId: string,
  configId: string,
  scheduledAt: Date
): Promise<MemeAutoGenerationJob> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting Meme Auto Video Generation ===`);
  console.log(`Job ID: ${jobId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Config ID: ${configId}`);
  console.log(`Scheduled At: ${scheduledAt.toISOString()}`);

  try {
    // 1. Get configuration
    console.log(`[${jobId}] Step 1: Fetching meme configuration...`);
    const config = await getMemeAutoGenerationConfig(userId);

    if (!config) {
      throw new Error("Meme auto-generation config not found");
    }

    if (!config.isEnabled) {
      throw new Error("Meme auto-generation is disabled");
    }

    // 2. Check available memes
    console.log(`[${jobId}] Step 2: Checking available memes...`);
    const availableMemes = await getAvailableMemesCount();
    console.log(`Available memes: ${availableMemes}`);

    if (availableMemes === 0) {
      throw new Error("No memes available for generation");
    }

    // 3. Reserve meme
    console.log(`[${jobId}] Step 3: Reserving meme...`);
    const meme = await selectNextMeme();

    if (!meme) {
      throw new Error("Failed to reserve meme");
    }

    const memeTitle = meme.editedTitle || meme.title;
    const memeImageUrl = meme.editedImageUrl || meme.imageUrl;

    console.log(`Selected meme ID: ${meme._id}`);
    console.log(`Meme title: ${memeTitle}`);
    console.log(`Meme image URL: ${memeImageUrl}`);

    // 4. Prepare audio (if configured)
    console.log(`[${jobId}] Step 4: Preparing audio...`);
    let audioUrl: string | undefined;
    let audioTrimStart: number | undefined;
    let audioTrimEnd: number | undefined;

    if (config.template.audio && config.template.audio.urls.length > 0) {
      const selectedAudioUrl = selectRandomFromArray(config.template.audio.urls)?.trim();
      const targetDuration = config.template.duration || 10;

      if (selectedAudioUrl) {
        if (config.template.audio.randomTrim) {
          const audioCut = await prepareAudioCut(selectedAudioUrl, targetDuration, true);
          audioUrl = selectedAudioUrl;
          audioTrimStart = audioCut.start;
          audioTrimEnd = audioCut.end;

          console.log(`Audio selected: ${audioUrl}`);
          console.log(`Audio trim: ${audioTrimStart}s - ${audioTrimEnd}s`);
        } else {
          audioUrl = selectedAudioUrl;
          audioTrimStart = 0;
          audioTrimEnd = targetDuration;
        }
      }
    } else {
      console.log("No audio configured, generating video without audio");
    }

    // 4.5. Select random GIF (if configured)
    console.log(`[${jobId}] Step 4.5: Selecting GIF...`);
    let gifUrl: string | undefined;

    if (config.template.gif && config.template.gif.urls.length > 0) {
      gifUrl = selectRandomFromArray(config.template.gif.urls)?.trim();
      console.log(`Selected GIF: ${gifUrl || "None"}`);
    } else {
      console.log("No GIF configured, generating video without GIF");
    }

    // 5. Create job record
    console.log(`[${jobId}] Step 5: Creating job record...`);
    const job = await createMemeAutoGenerationJob({
      userId,
      configId: String(config._id),
      status: "processing",
      memeId: String(meme._id),
      memeTitle,
      memeImageUrl,
      selectedResources: {
        audioUrl,
        audioTrimStart,
        audioTrimEnd,
      },
      retryCount: 0,
    });

    console.log(`Job created with ID: ${job._id}`);

    // 6. Render video with Ken Burns effect
    console.log(`[${jobId}] Step 6: Rendering meme video with ${config.template.imageEffect} effect...`);

    const renderResult = await renderVideoNew({
      backgroundImageUrl: memeImageUrl,
      imageEffect: config.template.imageEffect || "zoom-in-out",
      textElements: [], // No text overlay - meme already has text
      emojiElements: [],
      gifElements: gifUrl && config.template.gif
        ? [
            {
              url: gifUrl,
              x: 720 - config.template.gif.width - 70,
              y: 1280 - config.template.gif.height - 70,
              width: config.template.gif.width,
              height: config.template.gif.height,
            },
          ]
        : [],
      audioUrl,
      audioTrimStart,
      audioTrimEnd,
      duration: config.template.duration || 10,
      jobId,
    });

    console.log(`Video rendered successfully: ${renderResult.videoUrl}`);
    console.log(`Video duration: ${renderResult.duration}s`);

    // 7. Generate YouTube title and description
    console.log(`[${jobId}] Step 7: Generating YouTube metadata...`);
    let youtubeTitle = memeTitle;
    let youtubeDescription = memeTitle;

    if (config.youtube.useAI) {
      try {
        const [generatedTitle, generatedDescription] = await Promise.all([
          generateMemeShortsTitle(memeTitle),
          generateMemeShortsDescription(memeTitle, meme.subreddit),
        ]);

        youtubeTitle = generatedTitle;
        youtubeDescription = generatedDescription;

        console.log(`AI-generated meme title: ${youtubeTitle}`);
        console.log(`AI-generated meme description: ${youtubeDescription.substring(0, 100)}...`);
      } catch (aiError) {
        console.error("Failed to generate AI metadata, using original:", aiError);
      }
    }

    // 8. Add to scheduled videos
    console.log(`[${jobId}] Step 8: Adding to scheduled videos...`);

    const channelIdToUse =
      config.youtube.savedChannelId ||
      config.youtube.manualChannelId ||
      config.youtube.channelId;

    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: renderResult.videoUrl,
      title: youtubeTitle,
      description: youtubeDescription,
      tags: config.youtube.tags || ["meme", "memes", "humor", "viral", "shorts"],
      privacyStatus: config.youtube.privacyStatus || "public",
      scheduledAt,
      youtubeChannelId: channelIdToUse,
      memeId: String(meme._id),
      language: "es",
    });

    console.log(`Video scheduled for: ${scheduledAt.toISOString()}`);

    // 9. Update job status
    console.log(`[${jobId}] Step 9: Updating job status...`);
    await updateMemeJobStatus(job._id!, "completed", {
      results: {
        renderedVideoUrl: renderResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    // 10. Mark meme as used
    console.log(`[${jobId}] Step 10: Marking meme as used...`);
    await markRedditMemeStatus({
      id: meme._id!,
      status: "used",
    });

    // 11. Increment generated count
    await incrementMemeGeneratedCount(config._id!);

    console.log(`\n=== Meme Auto Video Generation Completed Successfully ===`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Video URL: ${renderResult.videoUrl}`);
    console.log(`Scheduled At: ${scheduledAt.toISOString()}\n`);

    return job;
  } catch (error) {
    console.error(`\n=== Meme Auto Video Generation Failed ===`);
    console.error(`Job ID: ${jobId}`);
    console.error(`Error:`, error);

    // Try to create or update job with error status
    try {
      const existingJob = await createMemeAutoGenerationJob({
        userId,
        configId,
        status: "failed",
        memeId: "",
        memeTitle: "",
        memeImageUrl: "",
        selectedResources: {},
        errorMessage: error instanceof Error ? error.message : String(error),
        retryCount: 0,
      });

      return existingJob;
    } catch (dbError) {
      console.error("Failed to create error job record:", dbError);
      throw error;
    }
  }
}
