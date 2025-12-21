import { ObjectId } from "mongodb";
import {
  getAutoGenerationConfig,
  createAutoGenerationJob,
  updateJobStatus,
  incrementGeneratedCount,
  AutoGenerationJob,
} from "@/lib/db/auto-generation";
import {
  getAutoGenerationConfigDE,
  createAutoGenerationJobDE,
  updateJobStatusDE,
  incrementGeneratedCountDE,
  AutoGenerationJobDE,
} from "@/lib/db/auto-generation-de";
import { addScheduledVideo } from "@/lib/db/users";
import { markJokeCandidateStatus } from "@/lib/ingest/storage";
import { markJokeCandidateStatusDE } from "@/lib/ingest-de/storage";
import { selectNextJoke, getAvailableJokesCount, selectNextJokeDE, getAvailableJokesCountDE } from "./joke-selector";
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
    const title = await generateVideoTitle(jokeText, config.youtube.titleTemplate);
    const description = generateVideoDescription(
      jokeText,
      config.youtube.descriptionTemplate,
      audioUrl
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
      language: "es",
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
 * Format: несколько цепляющих слов о шутке на испанском + пара смайликов + "Chiste del día"
 */
async function generateVideoTitle(
  jokeText: string,
  template?: string
): Promise<string> {
  if (template) {
    return template.replace("{joke}", jokeText.substring(0, 100));
  }

  // Use AI to generate catchy title in Spanish
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Crea un título corto y atractivo para YouTube Shorts con este chiste en español.

Chiste: ${jokeText}

Requisitos:
- En español
- Máximo 50 caracteres (sin contar emojis y "Chiste del día")
- Palabras que enganchen sobre el chiste
- 2 emojis relacionados con risa/humor
- Al final debe decir "Chiste del día"
- Sin hashtags

Formato: [Palabras enganchosas] [2 emojis] Chiste del día

Ejemplos:
- "¡No vas a creer esto! 😂🤣 Chiste del día"
- "El mejor chiste 🤣😆 Chiste del día"
- "Esto es increíble 😭😂 Chiste del día"

Devuelve SOLO el título, sin comillas ni explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en crear títulos virales para YouTube Shorts de comedia en español.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 100,
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (title && title.length <= 100) {
      return title;
    }
  } catch (error) {
    console.error("Failed to generate AI title, using fallback:", error);
  }

  // Fallback: simple title
  const emojis = ["😂", "🤣"];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const secondEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  
  // Extract first few words from joke
  const words = jokeText.split(/\s+/).slice(0, 5).join(" ");
  return `${words} ${randomEmoji}${secondEmoji} Chiste del día`;
}

/**
 * Generate video description from joke text
 * Includes music attribution for Bensound
 */
function generateVideoDescription(
  jokeText: string,
  template?: string,
  audioUrl?: string | null
): string {
  let description = "";

  if (template) {
    description = template.replace("{joke}", jokeText);
  } else {
    // Default description
    description = jokeText;
  }

  // Add music attribution if audio is used
  if (audioUrl) {
    // Extract track name from URL if possible, otherwise use generic
    let trackName = "Track Name";
    try {
      const urlParts = audioUrl.split("/");
      const fileName = urlParts[urlParts.length - 1].split("?")[0];
      if (fileName && fileName.endsWith(".mp3")) {
        trackName = fileName.replace(".mp3", "").replace(/[-_]/g, " ");
        // Capitalize first letter of each word
        trackName = trackName.split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
      }
    } catch (e) {
      // Use default track name
    }

    description += `\n\nMusic: "${trackName}" by Bensound.com
License: https://www.bensound.com/licensing`;
  }

  return description;
}

/**
 * Generate video title for German jokes
 * Format: catchy words about the joke in German + emojis + "Witz des Tages"
 */
async function generateVideoTitleDE(
  jokeText: string,
  template?: string
): Promise<string> {
  if (template) {
    return template.replace("{joke}", jokeText.substring(0, 100));
  }

  // Use AI to generate catchy title in German
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Erstelle einen kurzen und attraktiven Titel für YouTube Shorts mit diesem deutschen Witz.

Witz: ${jokeText}

Anforderungen:
- Auf Deutsch
- Maximal 50 Zeichen (ohne Emojis und "Witz des Tages")
- Fesselnde Worte über den Witz
- 2 Emojis mit Bezug zu Lachen/Humor
- Am Ende muss "Witz des Tages" stehen
- Keine Hashtags

Format: [Fesselnde Worte] [2 Emojis] Witz des Tages

Beispiele:
- "Das glaubst du nicht! 😂🤣 Witz des Tages"
- "Der beste Witz 🤣😆 Witz des Tages"
- "Unglaublich lustig 😭😂 Witz des Tages"

Gib NUR den Titel zurück, ohne Anführungszeichen oder Erklärungen.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Du bist ein Experte für virale YouTube Shorts-Titel für deutsche Comedy-Inhalte.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 100,
    });

    const title = response.choices[0]?.message?.content?.trim();

    if (title && title.length <= 100) {
      return title;
    }
  } catch (error) {
    console.error("[DE] Failed to generate AI title, using fallback:", error);
  }

  // Fallback: simple title
  const emojis = ["😂", "🤣"];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const secondEmoji = emojis[Math.floor(Math.random() * emojis.length)];

  // Extract first few words from joke
  const words = jokeText.split(/\s+/).slice(0, 5).join(" ");
  return `${words} ${randomEmoji}${secondEmoji} Witz des Tages`;
}

/**
 * Generate video description for German jokes
 * Includes music attribution for Bensound
 */
function generateVideoDescriptionDE(
  jokeText: string,
  template?: string,
  audioUrl?: string | null
): string {
  let description = "";

  if (template) {
    description = template.replace("{joke}", jokeText);
  } else {
    // Default description
    description = jokeText;
  }

  // Add music attribution if audio is used
  if (audioUrl) {
    // Extract track name from URL if possible, otherwise use generic
    let trackName = "Track Name";
    try {
      const urlParts = audioUrl.split("/");
      const fileName = urlParts[urlParts.length - 1].split("?")[0];
      if (fileName && fileName.endsWith(".mp3")) {
        trackName = fileName.replace(".mp3", "").replace(/[-_]/g, " ");
        // Capitalize first letter of each word
        trackName = trackName.split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
      }
    } catch (e) {
      // Use default track name
    }

    description += `\n\nMusik: "${trackName}" von Bensound.com
Lizenz: https://www.bensound.com/licensing`;
  }

  return description;
}

/**
 * Main function to generate auto video for German jokes
 * @param userId - User ID
 * @param configId - Auto-generation config ID
 * @param scheduledAt - Scheduled publish time
 * @returns Created job
 */
export async function generateAutoVideoDE(
  userId: string,
  configId: string,
  scheduledAt: Date
): Promise<AutoGenerationJobDE> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting German Auto Video Generation ===`);
  console.log(`[DE] Job ID: ${jobId}`);
  console.log(`[DE] User ID: ${userId}`);
  console.log(`[DE] Config ID: ${configId}`);
  console.log(`[DE] Scheduled At: ${scheduledAt.toISOString()}`);

  try {
    // 1. Get configuration
    console.log(`[DE][${jobId}] Step 1: Fetching configuration...`);
    const config = await getAutoGenerationConfigDE(userId);

    if (!config) {
      throw new Error("[DE] Auto-generation config not found");
    }

    if (!config.isEnabled) {
      throw new Error("[DE] Auto-generation is disabled");
    }

    // 2. Check available jokes
    console.log(`[DE][${jobId}] Step 2: Checking available German jokes...`);
    const availableJokes = await getAvailableJokesCountDE();
    console.log(`[DE] Available German jokes: ${availableJokes}`);

    if (availableJokes === 0) {
      throw new Error("[DE] No German jokes available for generation");
    }

    // 3. Reserve joke
    console.log(`[DE][${jobId}] Step 3: Reserving German joke...`);
    const joke = await selectNextJokeDE();

    if (!joke) {
      throw new Error("[DE] Failed to reserve German joke");
    }

    const jokeText = joke.editedText || joke.text;
    console.log(`[DE] Selected joke ID: ${joke._id}`);
    console.log(`[DE] Joke text (${jokeText.length} chars): ${jokeText.substring(0, 100)}...`);

    // 4. Get background from Unsplash
    console.log(`[DE][${jobId}] Step 4: Fetching background image...`);
    let backgroundImageUrl: string;

    try {
      const unsplashPhoto = await fetchUnsplashImage(
        config.template.background.unsplashKeywords,
        jokeText
      );
      backgroundImageUrl = unsplashPhoto.url;
      console.log(`[DE] Unsplash image: ${backgroundImageUrl}`);
      console.log(`[DE] Photographer: ${unsplashPhoto.photographer.name}`);
    } catch (unsplashError) {
      console.warn(`[DE] Unsplash failed, using fallback:`, unsplashError);

      if (config.template.background.fallbackImageUrl) {
        backgroundImageUrl = config.template.background.fallbackImageUrl;
        console.log(`[DE] Using fallback image: ${backgroundImageUrl}`);
      } else {
        throw new Error("[DE] Unsplash failed and no fallback image configured");
      }
    }

    // 5. Select random GIF
    console.log(`[DE][${jobId}] Step 5: Selecting GIF...`);
    let gifUrl = selectRandomFromArray(config.template.gif.urls);

    if (gifUrl) {
      gifUrl = gifUrl.trim();
    }

    console.log(`[DE] Selected GIF: ${gifUrl || "None"}`);

    // 6. Select and trim audio
    console.log(`[DE][${jobId}] Step 6: Preparing audio...`);
    let audioUrl = selectRandomFromArray(config.template.audio.urls);

    if (audioUrl) {
      audioUrl = audioUrl.trim();
    }

    console.log(`[DE] Selected audio: ${audioUrl || "None"}`);

    let audioTrimStart: number | undefined;
    let audioTrimEnd: number | undefined;

    if (audioUrl) {
      const isDirectAudioLink = /\.(mp3|wav|m4a|aac|ogg)(\?.*)?$/i.test(audioUrl);

      if (!isDirectAudioLink) {
        console.warn(`[DE] ⚠️ Audio URL is not a direct file link: ${audioUrl}`);
        console.warn(`[DE] ⚠️ Continuing without audio...`);
        audioUrl = null;
      } else {
        try {
          const audioCut = await prepareAudioCut(
            audioUrl,
            config.template.audio.duration,
            config.template.audio.randomTrim
          );
          audioTrimStart = audioCut.start;
          audioTrimEnd = audioCut.end;
          console.log(`[DE] Audio trim: ${audioTrimStart.toFixed(2)}s - ${audioTrimEnd.toFixed(2)}s`);
        } catch (audioError) {
          console.warn(`[DE] Audio processing failed:`, audioError);
          audioUrl = null;
        }
      }
    }

    // 7. Create job in queue
    console.log(`[DE][${jobId}] Step 7: Creating job in queue...`);
    const job = await createAutoGenerationJobDE({
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

    console.log(`[DE] Job created: ${job._id}`);

    // 8. Render video
    console.log(`[DE][${jobId}] Step 8: Rendering video...`);
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

    console.log(`[DE] Video rendered: ${videoResult.videoUrl}`);
    console.log(`[DE] Duration: ${videoResult.duration}s`);

    // 9. Generate title and description
    console.log(`[DE][${jobId}] Step 9: Generating German title and description...`);
    const title = await generateVideoTitleDE(jokeText, config.youtube.titleTemplate);
    const description = generateVideoDescriptionDE(
      jokeText,
      config.youtube.descriptionTemplate,
      audioUrl
    );

    console.log(`[DE] Title: ${title}`);

    // 10. Schedule video for publication
    console.log(`[DE][${jobId}] Step 10: Scheduling video for publication...`);
    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: videoResult.videoUrl,
      title,
      description,
      tags: config.youtube.tags,
      privacyStatus: config.youtube.privacyStatus,
      scheduledAt,
      jokeId: joke._id!.toString(),
      language: "de",
    });

    console.log(`[DE] Scheduled video ID: ${scheduledVideo.id}`);
    console.log(`[DE] Scheduled for: ${scheduledAt.toISOString()}`);

    // 11. Mark joke as reserved
    await markJokeCandidateStatusDE({
      id: joke._id!,
      status: "reserved",
      notes: `[DE] Auto-generated video scheduled for ${scheduledAt.toISOString()}`,
    });

    // 12. Update job status
    console.log(`[DE][${jobId}] Step 11: Updating job status...`);
    await updateJobStatusDE(job._id!, "completed", {
      results: {
        renderedVideoUrl: videoResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    // 13. Update config stats
    console.log(`[DE][${jobId}] Step 12: Updating stats...`);
    await incrementGeneratedCountDE(new ObjectId(configId));

    console.log(`[DE] === German Auto Video Generation Completed Successfully ===\n`);

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
    console.error(`[DE][${jobId}] ERROR in auto-generation:`, error);

    try {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await updateJobStatusDE(new ObjectId(jobId), "failed", {
        errorMessage,
      });
    } catch (updateError) {
      console.error(`[DE][${jobId}] Failed to update job status:`, updateError);
    }

    throw error;
  }
}
