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
import {
  getAutoGenerationConfigPT,
  createAutoGenerationJobPT,
  updateJobStatusPT,
  incrementGeneratedCountPT,
  AutoGenerationJobPT,
} from "@/lib/db/auto-generation-pt";
import {
  getAutoGenerationConfigFR,
  createAutoGenerationJobFR,
  updateJobStatusFR,
  incrementGeneratedCountFR,
  AutoGenerationJobFR,
} from "@/lib/db/auto-generation-fr";
import { addScheduledVideo } from "@/lib/db/users";
import { markJokeCandidateStatus } from "@/lib/ingest/storage";
import { markJokeCandidateStatusDE } from "@/lib/ingest-de/storage";
import { markJokeCandidateStatusPT } from "@/lib/ingest-pt/storage";
import { markJokeCandidateStatusFR } from "@/lib/ingest-fr/storage";
import { selectNextJoke, getAvailableJokesCount, selectNextJokeDE, getAvailableJokesCountDE, selectNextJokePT, getAvailableJokesCountPT, selectNextJokeFR, getAvailableJokesCountFR } from "./joke-selector";
import { prepareAudioCut, selectRandomFromArray } from "./audio-processor";
import { renderAutoVideo } from "./video-renderer";
import { fetchUnsplashImage } from "@/lib/unsplash/client";
import { polishJokeText } from "@/lib/services/joke-polisher";

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

    const rawJokeText = joke.editedText || joke.text;
    console.log(`Selected joke ID: ${joke._id}`);
    console.log(`Raw joke text (${rawJokeText.length} chars): ${rawJokeText.substring(0, 100)}...`);

    // 3.5. Polish joke text (fix spelling, punctuation, line breaks)
    console.log(`[${jobId}] Step 3.5: Polishing joke text...`);
    const polished = await polishJokeText(rawJokeText, "es");
    const jokeText = polished.text;
    if (polished.wasModified) {
      console.log(`Joke text polished: ${jokeText.substring(0, 100)}...`);
    }

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
        // Use default placeholder image if no custom fallback is configured
        backgroundImageUrl = "https://picsum.photos/1080/1920";
        console.log(`Using default placeholder image: ${backgroundImageUrl}`);
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
      youtubeChannelId: config.youtube.savedChannelId || config.youtube.manualChannelId || config.youtube.channelId, // Priority: savedChannelId > manualChannelId > channelId
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
    // Default description with joke text
    description = jokeText;

    // Add call to action
    description += `\n\n😂 ¿Te gustó? ¡Dale like y suscríbete para más chistes diarios!`;

    // Add SEO hashtags
    description += `\n\n#shorts #chiste #humor #comedia #risa #gracioso #funny #chistedeldía`;
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

    description += `\n\nMusic: "${trackName}" by Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/`;
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
    // Default description with joke text
    description = jokeText;

    // Add call to action in German
    description += `\n\n😂 Hat es dir gefallen? Daumen hoch und abonniere für tägliche Witze!`;

    // Add SEO hashtags
    description += `\n\n#shorts #witz #humor #komödie #lustig #witzig #funny #witzdestages`;
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

    description += `\n\nMusik: "${trackName}" von Kevin MacLeod (incompetech.com)
Lizenziert unter Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/`;
  }

  return description;
}

/**
 * Generate video title for Portuguese jokes
 * Format: catchy words about the joke in Portuguese + emojis + "Piada do dia"
 */
async function generateVideoTitlePT(
  jokeText: string,
  template?: string
): Promise<string> {
  if (template) {
    return template.replace("{joke}", jokeText.substring(0, 100));
  }

  // Use AI to generate catchy title in Portuguese
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Crie um título curto e atraente para YouTube Shorts com esta piada em português.

Piada: ${jokeText}

Requisitos:
- Em português
- Máximo 50 caracteres (sem contar emojis e "Piada do dia")
- Palavras que chamem atenção sobre a piada
- 2 emojis relacionados com riso/humor
- No final deve dizer "Piada do dia"
- Sem hashtags

Formato: [Palavras impactantes] [2 emojis] Piada do dia

Exemplos:
- "Não vai acreditar nisso! 😂🤣 Piada do dia"
- "A melhor piada 🤣😆 Piada do dia"
- "Isso é incrível 😭😂 Piada do dia"

Retorne APENAS o título, sem aspas ou explicações.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você é um especialista em criar títulos virais para YouTube Shorts de comédia em português.",
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
    console.error("[PT] Failed to generate AI title, using fallback:", error);
  }

  // Fallback: simple title
  const emojis = ["😂", "🤣"];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const secondEmoji = emojis[Math.floor(Math.random() * emojis.length)];

  // Extract first few words from joke
  const words = jokeText.split(/\s+/).slice(0, 5).join(" ");
  return `${words} ${randomEmoji}${secondEmoji} Piada do dia`;
}

/**
 * Generate video description for Portuguese jokes
 * Includes music attribution for Bensound
 */
function generateVideoDescriptionPT(
  jokeText: string,
  template?: string,
  audioUrl?: string | null
): string {
  let description = "";

  if (template) {
    description = template.replace("{joke}", jokeText);
  } else {
    // Default description with joke text
    description = jokeText;

    // Add call to action in Portuguese
    description += `\n\n😂 Gostou? Deixe seu like e inscreva-se para piadas diárias!`;

    // Add SEO hashtags
    description += `\n\n#shorts #piada #humor #comédia #risadas #engraçado #funny #piadadodia`;
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

    description += `\n\nMúsica: "${trackName}" por Kevin MacLeod (incompetech.com)
Licenciado sob Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/`;
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

    const rawJokeText = joke.editedText || joke.text;
    console.log(`[DE] Selected joke ID: ${joke._id}`);
    console.log(`[DE] Raw joke text (${rawJokeText.length} chars): ${rawJokeText.substring(0, 100)}...`);

    // 3.5. Polish joke text (fix spelling, punctuation, line breaks)
    console.log(`[DE][${jobId}] Step 3.5: Polishing joke text...`);
    const polished = await polishJokeText(rawJokeText, "de");
    const jokeText = polished.text;
    if (polished.wasModified) {
      console.log(`[DE] Joke text polished: ${jokeText.substring(0, 100)}...`);
    }

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
        // Use default placeholder image if no custom fallback is configured
        backgroundImageUrl = "https://picsum.photos/1080/1920";
        console.log(`[DE] Using default placeholder image: ${backgroundImageUrl}`);
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
      youtubeChannelId: config.youtube.savedChannelId || config.youtube.manualChannelId || config.youtube.channelId, // Priority: savedChannelId > manualChannelId > channelId
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

/**
 * Main function to generate auto video for Portuguese jokes
 * @param userId - User ID
 * @param configId - Auto-generation config ID
 * @param scheduledAt - Scheduled publish time
 * @returns Created job
 */
export async function generateAutoVideoPT(
  userId: string,
  configId: string,
  scheduledAt: Date
): Promise<AutoGenerationJobPT> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting Portuguese Auto Video Generation ===`);
  console.log(`[PT] Job ID: ${jobId}`);
  console.log(`[PT] User ID: ${userId}`);
  console.log(`[PT] Config ID: ${configId}`);
  console.log(`[PT] Scheduled At: ${scheduledAt.toISOString()}`);

  try {
    // 1. Get configuration
    console.log(`[PT][${jobId}] Step 1: Fetching configuration...`);
    const config = await getAutoGenerationConfigPT(userId);

    if (!config) {
      throw new Error("[PT] Auto-generation config not found");
    }

    if (!config.isEnabled) {
      throw new Error("[PT] Auto-generation is disabled");
    }

    // 2. Check available jokes
    console.log(`[PT][${jobId}] Step 2: Checking available Portuguese jokes...`);
    const availableJokes = await getAvailableJokesCountPT();
    console.log(`[PT] Available Portuguese jokes: ${availableJokes}`);

    if (availableJokes === 0) {
      throw new Error("[PT] No Portuguese jokes available for generation");
    }

    // 3. Reserve joke
    console.log(`[PT][${jobId}] Step 3: Reserving Portuguese joke...`);
    const joke = await selectNextJokePT();

    if (!joke) {
      throw new Error("[PT] Failed to reserve Portuguese joke");
    }

    const rawJokeText = joke.editedText || joke.text;
    console.log(`[PT] Selected joke ID: ${joke._id}`);
    console.log(`[PT] Raw joke text (${rawJokeText.length} chars): ${rawJokeText.substring(0, 100)}...`);

    // 3.5. Polish joke text (fix spelling, punctuation, line breaks)
    console.log(`[PT][${jobId}] Step 3.5: Polishing joke text...`);
    const polished = await polishJokeText(rawJokeText, "pt");
    const jokeText = polished.text;
    if (polished.wasModified) {
      console.log(`[PT] Joke text polished: ${jokeText.substring(0, 100)}...`);
    }

    // 4. Get background from Unsplash
    console.log(`[PT][${jobId}] Step 4: Fetching background image...`);
    let backgroundImageUrl: string;

    try {
      const unsplashPhoto = await fetchUnsplashImage(
        config.template.background.unsplashKeywords,
        jokeText
      );
      backgroundImageUrl = unsplashPhoto.url;
      console.log(`[PT] Unsplash image: ${backgroundImageUrl}`);
      console.log(`[PT] Photographer: ${unsplashPhoto.photographer.name}`);
    } catch (unsplashError) {
      console.warn(`[PT] Unsplash failed, using fallback:`, unsplashError);

      if (config.template.background.fallbackImageUrl) {
        backgroundImageUrl = config.template.background.fallbackImageUrl;
        console.log(`[PT] Using fallback image: ${backgroundImageUrl}`);
      } else {
        // Use default placeholder image if no custom fallback is configured
        backgroundImageUrl = "https://picsum.photos/1080/1920";
        console.log(`[PT] Using default placeholder image: ${backgroundImageUrl}`);
      }
    }

    // 5. Select random GIF
    console.log(`[PT][${jobId}] Step 5: Selecting GIF...`);
    let gifUrl = selectRandomFromArray(config.template.gif.urls);

    if (gifUrl) {
      gifUrl = gifUrl.trim();
    }

    console.log(`[PT] Selected GIF: ${gifUrl || "None"}`);

    // 6. Select and trim audio
    console.log(`[PT][${jobId}] Step 6: Preparing audio...`);
    let audioUrl = selectRandomFromArray(config.template.audio.urls);

    if (audioUrl) {
      audioUrl = audioUrl.trim();
    }

    console.log(`[PT] Selected audio: ${audioUrl || "None"}`);

    let audioTrimStart: number | undefined;
    let audioTrimEnd: number | undefined;

    if (audioUrl) {
      const isDirectAudioLink = /\.(mp3|wav|m4a|aac|ogg)(\?.*)?$/i.test(audioUrl);

      if (!isDirectAudioLink) {
        console.warn(`[PT] ⚠️ Audio URL is not a direct file link: ${audioUrl}`);
        console.warn(`[PT] ⚠️ Continuing without audio...`);
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
          console.log(`[PT] Audio trim: ${audioTrimStart.toFixed(2)}s - ${audioTrimEnd.toFixed(2)}s`);
        } catch (audioError) {
          console.warn(`[PT] Audio processing failed:`, audioError);
          audioUrl = null;
        }
      }
    }

    // 7. Create job in queue
    console.log(`[PT][${jobId}] Step 7: Creating job in queue...`);
    const job = await createAutoGenerationJobPT({
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

    console.log(`[PT] Job created: ${job._id}`);

    // 8. Render video
    console.log(`[PT][${jobId}] Step 8: Rendering video...`);
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

    console.log(`[PT] Video rendered: ${videoResult.videoUrl}`);
    console.log(`[PT] Duration: ${videoResult.duration}s`);

    // 9. Generate title and description
    console.log(`[PT][${jobId}] Step 9: Generating Portuguese title and description...`);
    const title = await generateVideoTitlePT(jokeText, config.youtube.titleTemplate);
    const description = generateVideoDescriptionPT(
      jokeText,
      config.youtube.descriptionTemplate,
      audioUrl
    );

    console.log(`[PT] Title: ${title}`);

    // 10. Schedule video for publication
    console.log(`[PT][${jobId}] Step 10: Scheduling video for publication...`);
    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: videoResult.videoUrl,
      title,
      description,
      tags: config.youtube.tags,
      privacyStatus: config.youtube.privacyStatus,
      scheduledAt,
      jokeId: joke._id!.toString(),
      language: "pt",
      youtubeChannelId: config.youtube.savedChannelId || config.youtube.manualChannelId || config.youtube.channelId, // Priority: savedChannelId > manualChannelId > channelId
    });

    console.log(`[PT] Scheduled video ID: ${scheduledVideo.id}`);
    console.log(`[PT] Scheduled for: ${scheduledAt.toISOString()}`);

    // 11. Mark joke as reserved
    await markJokeCandidateStatusPT({
      id: joke._id!,
      status: "reserved",
      notes: `[PT] Auto-generated video scheduled for ${scheduledAt.toISOString()}`,
    });

    // 12. Update job status
    console.log(`[PT][${jobId}] Step 11: Updating job status...`);
    await updateJobStatusPT(job._id!, "completed", {
      results: {
        renderedVideoUrl: videoResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    // 13. Update config stats
    console.log(`[PT][${jobId}] Step 12: Updating stats...`);
    await incrementGeneratedCountPT(new ObjectId(configId));

    console.log(`[PT] === Portuguese Auto Video Generation Completed Successfully ===\n`);

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
    console.error(`[PT][${jobId}] ERROR in auto-generation:`, error);

    try {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await updateJobStatusPT(new ObjectId(jobId), "failed", {
        errorMessage,
      });
    } catch (updateError) {
      console.error(`[PT][${jobId}] Failed to update job status:`, updateError);
    }

    throw error;
  }
}

/**
 * Generate video title for French jokes
 * Format: catchy words about the joke in French + emojis + "Blague du jour"
 */
async function generateVideoTitleFR(
  jokeText: string,
  template?: string
): Promise<string> {
  if (template) {
    return template.replace("{joke}", jokeText.substring(0, 100));
  }

  // Use AI to generate catchy title in French
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Crée un titre court et accrocheur pour YouTube Shorts avec cette blague en français.

Blague: ${jokeText}

Exigences:
- En français
- Maximum 50 caractères (sans compter les emojis et "Blague du jour")
- Mots accrocheurs sur la blague
- 2 emojis liés au rire/humour
- À la fin doit dire "Blague du jour"
- Pas de hashtags

Format: [Mots accrocheurs] [2 emojis] Blague du jour

Exemples:
- "Tu ne vas pas le croire! 😂🤣 Blague du jour"
- "La meilleure blague 🤣😆 Blague du jour"
- "C'est incroyable 😭😂 Blague du jour"

Renvoie UNIQUEMENT le titre, sans guillemets ni explications.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en création de titres viraux pour YouTube Shorts de comédie en français.",
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
    console.error("[FR] Failed to generate AI title, using fallback:", error);
  }

  // Fallback: simple title
  const emojis = ["😂", "🤣"];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const secondEmoji = emojis[Math.floor(Math.random() * emojis.length)];

  // Extract first few words from joke
  const words = jokeText.split(/\s+/).slice(0, 5).join(" ");
  return `${words} ${randomEmoji}${secondEmoji} Blague du jour`;
}

/**
 * Generate video description for French jokes
 * Includes music attribution for Bensound
 */
function generateVideoDescriptionFR(
  jokeText: string,
  template?: string,
  audioUrl?: string | null
): string {
  let description = "";

  if (template) {
    description = template.replace("{joke}", jokeText);
  } else {
    // Default description with joke text
    description = jokeText;

    // Add call to action in French
    description += `\n\n😂 Ça t'a plu? Like et abonne-toi pour des blagues quotidiennes!`;

    // Add SEO hashtags
    description += `\n\n#shorts #blague #humour #rire #drôle #comique #funny #blaguefrançaise`;
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

    description += `\n\nMusique: "${trackName}" par Kevin MacLeod (incompetech.com)
Licence Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/`;
  }

  return description;
}

/**
 * Main function to generate auto video for French jokes
 * @param userId - User ID
 * @param configId - Auto-generation config ID
 * @param scheduledAt - Scheduled publish time
 * @returns Created job
 */
export async function generateAutoVideoFR(
  userId: string,
  configId: string,
  scheduledAt: Date
): Promise<AutoGenerationJobFR> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting French Auto Video Generation ===`);
  console.log(`[FR] Job ID: ${jobId}`);
  console.log(`[FR] User ID: ${userId}`);
  console.log(`[FR] Config ID: ${configId}`);
  console.log(`[FR] Scheduled At: ${scheduledAt.toISOString()}`);

  try {
    // 1. Get configuration
    console.log(`[FR][${jobId}] Step 1: Fetching configuration...`);
    const config = await getAutoGenerationConfigFR(userId);

    if (!config) {
      throw new Error("[FR] Auto-generation config not found");
    }

    if (!config.isEnabled) {
      throw new Error("[FR] Auto-generation is disabled");
    }

    // 2. Check available jokes
    console.log(`[FR][${jobId}] Step 2: Checking available French jokes...`);
    const availableJokes = await getAvailableJokesCountFR();
    console.log(`[FR] Available French jokes: ${availableJokes}`);

    if (availableJokes === 0) {
      throw new Error("[FR] No French jokes available for generation");
    }

    // 3. Reserve joke
    console.log(`[FR][${jobId}] Step 3: Reserving French joke...`);
    const joke = await selectNextJokeFR();

    if (!joke) {
      throw new Error("[FR] Failed to reserve French joke");
    }

    const rawJokeText = joke.editedText || joke.text;
    console.log(`[FR] Selected joke ID: ${joke._id}`);
    console.log(`[FR] Raw joke text (${rawJokeText.length} chars): ${rawJokeText.substring(0, 100)}...`);

    // 3.5. Polish joke text (fix spelling, punctuation, line breaks)
    console.log(`[FR][${jobId}] Step 3.5: Polishing joke text...`);
    const polished = await polishJokeText(rawJokeText, "fr");
    const jokeText = polished.text;
    if (polished.wasModified) {
      console.log(`[FR] Joke text polished: ${jokeText.substring(0, 100)}...`);
    }

    // 4. Get background from Unsplash
    console.log(`[FR][${jobId}] Step 4: Fetching background image...`);
    let backgroundImageUrl: string;

    try {
      const unsplashPhoto = await fetchUnsplashImage(
        config.template.background.unsplashKeywords,
        jokeText
      );
      backgroundImageUrl = unsplashPhoto.url;
      console.log(`[FR] Unsplash image: ${backgroundImageUrl}`);
      console.log(`[FR] Photographer: ${unsplashPhoto.photographer.name}`);
    } catch (unsplashError) {
      console.warn(`[FR] Unsplash failed, using fallback:`, unsplashError);

      if (config.template.background.fallbackImageUrl) {
        backgroundImageUrl = config.template.background.fallbackImageUrl;
        console.log(`[FR] Using fallback image: ${backgroundImageUrl}`);
      } else {
        // Use default placeholder image if no custom fallback is configured
        backgroundImageUrl = "https://picsum.photos/1080/1920";
        console.log(`[FR] Using default placeholder image: ${backgroundImageUrl}`);
      }
    }

    // 5. Select random GIF
    console.log(`[FR][${jobId}] Step 5: Selecting GIF...`);
    let gifUrl = selectRandomFromArray(config.template.gif.urls);

    if (gifUrl) {
      gifUrl = gifUrl.trim();
    }

    console.log(`[FR] Selected GIF: ${gifUrl || "None"}`);

    // 6. Select and trim audio
    console.log(`[FR][${jobId}] Step 6: Preparing audio...`);
    let audioUrl = selectRandomFromArray(config.template.audio.urls);

    if (audioUrl) {
      audioUrl = audioUrl.trim();
    }

    console.log(`[FR] Selected audio: ${audioUrl || "None"}`);

    let audioTrimStart: number | undefined;
    let audioTrimEnd: number | undefined;

    if (audioUrl) {
      const isDirectAudioLink = /\.(mp3|wav|m4a|aac|ogg)(\?.*)?$/i.test(audioUrl);

      if (!isDirectAudioLink) {
        console.warn(`[FR] ⚠️ Audio URL is not a direct file link: ${audioUrl}`);
        console.warn(`[FR] ⚠️ Continuing without audio...`);
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
          console.log(`[FR] Audio trim: ${audioTrimStart.toFixed(2)}s - ${audioTrimEnd.toFixed(2)}s`);
        } catch (audioError) {
          console.warn(`[FR] Audio processing failed:`, audioError);
          audioUrl = null;
        }
      }
    }

    // 7. Create job in queue
    console.log(`[FR][${jobId}] Step 7: Creating job in queue...`);
    const job = await createAutoGenerationJobFR({
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

    console.log(`[FR] Job created: ${job._id}`);

    // 8. Render video
    console.log(`[FR][${jobId}] Step 8: Rendering video...`);
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

    console.log(`[FR] Video rendered: ${videoResult.videoUrl}`);
    console.log(`[FR] Duration: ${videoResult.duration}s`);

    // 9. Generate title and description
    console.log(`[FR][${jobId}] Step 9: Generating French title and description...`);
    const title = await generateVideoTitleFR(jokeText, config.youtube.titleTemplate);
    const description = generateVideoDescriptionFR(
      jokeText,
      config.youtube.descriptionTemplate,
      audioUrl
    );

    console.log(`[FR] Title: ${title}`);

    // 10. Schedule video for publication
    console.log(`[FR][${jobId}] Step 10: Scheduling video for publication...`);
    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: videoResult.videoUrl,
      title,
      description,
      tags: config.youtube.tags,
      privacyStatus: config.youtube.privacyStatus,
      scheduledAt,
      jokeId: joke._id!.toString(),
      language: "fr",
      youtubeChannelId: config.youtube.savedChannelId || config.youtube.manualChannelId || config.youtube.channelId, // Priority: savedChannelId > manualChannelId > channelId
    });

    console.log(`[FR] Scheduled video ID: ${scheduledVideo.id}`);
    console.log(`[FR] Scheduled for: ${scheduledAt.toISOString()}`);

    // 11. Mark joke as reserved
    await markJokeCandidateStatusFR({
      id: joke._id!,
      status: "reserved",
      notes: `[FR] Auto-generated video scheduled for ${scheduledAt.toISOString()}`,
    });

    // 12. Update job status
    console.log(`[FR][${jobId}] Step 11: Updating job status...`);
    await updateJobStatusFR(job._id!, "completed", {
      results: {
        renderedVideoUrl: videoResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    // 13. Update config stats
    console.log(`[FR][${jobId}] Step 12: Updating stats...`);
    await incrementGeneratedCountFR(new ObjectId(configId));

    console.log(`[FR] === French Auto Video Generation Completed Successfully ===\n`);

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
    console.error(`[FR][${jobId}] ERROR in auto-generation:`, error);

    try {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await updateJobStatusFR(new ObjectId(jobId), "failed", {
        errorMessage,
      });
    } catch (updateError) {
      console.error(`[FR][${jobId}] Failed to update job status:`, updateError);
    }

    throw error;
  }
}
