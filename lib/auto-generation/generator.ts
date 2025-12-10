import { ObjectId } from "mongodb";
import {
  getAutoGenerationConfig,
  createAutoGenerationJob,
  updateJobStatus,
  incrementGeneratedCount,
  AutoGenerationJob,
} from "@/lib/db/auto-generation";
import { addScheduledVideo } from "@/lib/db/users";
import { markJokeCandidateStatus } from "@/lib/ingest/storage";
import { selectNextJoke, getAvailableJokesCount } from "./joke-selector";
import { prepareAudioCut, selectRandomFromArray } from "./audio-processor";
import { renderAutoVideo } from "./video-renderer";
import { fetchUnsplashImage } from "@/lib/unsplash/client";

/**
 * Main function to generate auto video
 * @param userId - User ID
 * @param configId - Auto-generation config ID
 * @param scheduledAt - Scheduled publish time
 * @returns Created job
 */
export async function generateAutoVideo(
  userId: string,
  configId: string,
  scheduledAt: Date
): Promise<AutoGenerationJob> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting Auto Video Generation ===`);
  console.log(`Job ID: ${jobId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Config ID: ${configId}`);
  console.log(`Scheduled At: ${scheduledAt.toISOString()}`);

  try {
    // 1. Get configuration
    console.log(`[${jobId}] Step 1: Fetching configuration...`);
    const config = await getAutoGenerationConfig(userId);

    if (!config) {
      throw new Error("Auto-generation config not found");
    }

    if (!config.isEnabled) {
      throw new Error("Auto-generation is disabled");
    }

    // 2. Check available jokes
    console.log(`[${jobId}] Step 2: Checking available jokes...`);
    const availableJokes = await getAvailableJokesCount();
    console.log(`Available jokes: ${availableJokes}`);

    if (availableJokes === 0) {
      throw new Error("No jokes available for generation");
    }

    // 3. Reserve joke
    console.log(`[${jobId}] Step 3: Reserving joke...`);
    const joke = await selectNextJoke();

    if (!joke) {
      throw new Error("Failed to reserve joke");
    }

    const jokeText = joke.editedText || joke.text;
    console.log(`Selected joke ID: ${joke._id}`);
    console.log(`Joke text (${jokeText.length} chars): ${jokeText.substring(0, 100)}...`);

    // 4. Get background from Unsplash
    console.log(`[${jobId}] Step 4: Fetching background image...`);
    let backgroundImageUrl: string;

    try {
      const unsplashPhoto = await fetchUnsplashImage(
        config.template.background.unsplashKeywords,
        jokeText
      );
      backgroundImageUrl = unsplashPhoto.url;
      console.log(`Unsplash image: ${backgroundImageUrl}`);
      console.log(`Photographer: ${unsplashPhoto.photographer.name}`);
    } catch (unsplashError) {
      console.warn(`Unsplash failed, using fallback:`, unsplashError);

      if (config.template.background.fallbackImageUrl) {
        backgroundImageUrl = config.template.background.fallbackImageUrl;
        console.log(`Using fallback image: ${backgroundImageUrl}`);
      } else {
        throw new Error("Unsplash failed and no fallback image configured");
      }
    }

    // 5. Select random GIF
    console.log(`[${jobId}] Step 5: Selecting GIF...`);
    let gifUrl = selectRandomFromArray(config.template.gif.urls);

    // Trim whitespace from URL
    if (gifUrl) {
      gifUrl = gifUrl.trim();
    }

    console.log(`Selected GIF: ${gifUrl || "None"}`);

    // 6. Select and trim audio
    console.log(`[${jobId}] Step 6: Preparing audio...`);
    let audioUrl = selectRandomFromArray(config.template.audio.urls);

    // Trim whitespace from URL
    if (audioUrl) {
      audioUrl = audioUrl.trim();
    }

    console.log(`Selected audio: ${audioUrl || "None"}`);

    let audioTrimStart: number | undefined;
    let audioTrimEnd: number | undefined;

    if (audioUrl) {
      // Validate audio URL - must be direct link to .mp3/.wav/.m4a file
      const isDirectAudioLink = /\.(mp3|wav|m4a|aac|ogg)(\?.*)?$/i.test(audioUrl);

      if (!isDirectAudioLink) {
        console.warn(`⚠️ Audio URL is not a direct file link: ${audioUrl}`);
        console.warn(`⚠️ Audio URLs must end with .mp3, .wav, .m4a, etc.`);
        console.warn(`⚠️ Continuing without audio...`);
        audioUrl = null; // Skip invalid audio
      } else {
        try {
          const audioCut = await prepareAudioCut(
            audioUrl,
            config.template.audio.duration,
            config.template.audio.randomTrim
          );
          audioTrimStart = audioCut.start;
          audioTrimEnd = audioCut.end;
          console.log(`Audio trim: ${audioTrimStart.toFixed(2)}s - ${audioTrimEnd.toFixed(2)}s`);
        } catch (audioError) {
          console.warn(`Audio processing failed:`, audioError);
          // Continue without audio
          audioUrl = null;
        }
      }
    }

    // 7. Create job in queue
    console.log(`[${jobId}] Step 7: Creating job in queue...`);
    const job = await createAutoGenerationJob({
      userId,
      configId,
      status: "processing",
      jokeId: joke._id!.toString(),
      jokeText,
      selectedResources: {
        backgroundImageUrl,
        gifUrl: gifUrl || undefined,
        audioUrl: audioUrl || undefined,
        audioTrimStart,
        audioTrimEnd,
      },
      retryCount: 0,
    });

    console.log(`Job created: ${job._id}`);

    // 8. Render video
    console.log(`[${jobId}] Step 8: Rendering video...`);
    const videoResult = await renderAutoVideo(
      config.template,
      jokeText,
      backgroundImageUrl,
      gifUrl,
      audioUrl,
      audioTrimStart,
      audioTrimEnd,
      jobId
    );

    console.log(`Video rendered: ${videoResult.videoUrl}`);
    console.log(`Duration: ${videoResult.duration}s`);

    // 9. Generate title and description
    console.log(`[${jobId}] Step 9: Generating title and description...`);
    const title = generateVideoTitle(jokeText, config.youtube.titleTemplate);
    const description = generateVideoDescription(
      jokeText,
      config.youtube.descriptionTemplate
    );

    console.log(`Title: ${title}`);

    // 10. Schedule video for publication
    console.log(`[${jobId}] Step 10: Scheduling video for publication...`);
    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: videoResult.videoUrl,
      title,
      description,
      tags: config.youtube.tags,
      privacyStatus: config.youtube.privacyStatus,
      scheduledAt,
      jokeId: joke._id!.toString(),
    });

    console.log(`Scheduled video ID: ${scheduledVideo.id}`);
    console.log(`Scheduled for: ${scheduledAt.toISOString()}`);

    // 11. Mark joke as reserved (already done by selectNextJoke, but confirm)
    await markJokeCandidateStatus({
      id: joke._id!,
      status: "reserved",
      notes: `Auto-generated video scheduled for ${scheduledAt.toISOString()}`,
    });

    // 12. Update job status
    console.log(`[${jobId}] Step 11: Updating job status...`);
    await updateJobStatus(job._id!, "completed", {
      results: {
        renderedVideoUrl: videoResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    // 13. Update config stats
    console.log(`[${jobId}] Step 12: Updating stats...`);
    await incrementGeneratedCount(new ObjectId(configId));

    console.log(`=== Auto Video Generation Completed Successfully ===\n`);

    return {
      ...job,
      status: "completed",
      results: {
        renderedVideoUrl: videoResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    };
  } catch (error) {
    console.error(`[${jobId}] ERROR in auto-generation:`, error);

    // Try to update job status to failed
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Create or update job as failed
      await updateJobStatus(new ObjectId(jobId), "failed", {
        errorMessage,
      });
    } catch (updateError) {
      console.error(`[${jobId}] Failed to update job status:`, updateError);
    }

    throw error;
  }
}

/**
 * Generate video title from joke text
 */
function generateVideoTitle(
  jokeText: string,
  template?: string
): string {
  if (template) {
    return template.replace("{joke}", jokeText.substring(0, 100));
  }

  // Default: use first 80 characters of joke
  const maxLength = 80;
  let title = jokeText.substring(0, maxLength);

  if (jokeText.length > maxLength) {
    title += "...";
  }

  return title;
}

/**
 * Generate video description from joke text
 */
function generateVideoDescription(
  jokeText: string,
  template?: string
): string {
  if (template) {
    return template.replace("{joke}", jokeText);
  }

  // Default description
  return jokeText;
}
