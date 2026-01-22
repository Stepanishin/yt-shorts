import { ObjectId } from "mongodb";
import {
  getNewsAutoGenerationConfig,
  createNewsAutoGenerationJob,
  updateNewsJobStatus,
  incrementNewsGeneratedCount,
  NewsAutoGenerationJob,
} from "@/lib/db/auto-generation-news";
import { addScheduledVideo } from "@/lib/db/users";
import { markNewsCandidateStatus } from "@/lib/ingest-news/storage";
import { selectNextNews, getAvailableNewsCount } from "./news-selector";
import { prepareAudioCut, selectRandomFromArray } from "./audio-processor";
import { renderNewsVideo } from "@/lib/video/renderer-new";
import { generateNewsShortsTitle, generateNewsShortsDescription } from "@/lib/youtube/title-generator";

/**
 * Generate short catchy headline for video (max 2 lines)
 * Takes original title and summary, returns short Spanish headline
 */
async function generateShortHeadline(
  title: string,
  summary: string
): Promise<string> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Eres un experto en crear titulares impactantes para prensa del corazón española.

Título original: ${title}
Resumen: ${summary}

TAREA:
Crea un titular CORTO y LLAMATIVO que capture la esencia de la noticia.

REQUISITOS ESTRICTOS:
- Longitud: 60-80 caracteres MÁXIMO (incluyendo espacios)
- Máximo 2 líneas cuando se muestra en pantalla
- Estilo sensacionalista de prensa del corazón
- Usar palabras impactantes: "BOMBAZO", "EXCLUSIVA", "REVELACIÓN", etc.
- En MAYÚSCULAS las palabras clave
- En ESPAÑOL

EJEMPLOS del estilo deseado:
- "¡BOMBAZO en la Casa Real!"
- "EXCLUSIVA: Romance secreto confirmado"
- "¡ESCÁNDALO sin precedentes!"
- "REVELACIÓN sobre la Reina"

Devuelve SOLO el titular, sin comillas ni explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un redactor experto de prensa del corazón española, especializado en titulares cortos y llamativos.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 50,
    });

    const generatedHeadline = response.choices[0]?.message?.content?.trim();

    if (generatedHeadline && generatedHeadline.length >= 30 && generatedHeadline.length <= 90) {
      console.log(`✨ Generated short headline (${generatedHeadline.length} chars): ${generatedHeadline}`);
      return generatedHeadline;
    } else {
      console.warn(`Generated headline length out of range (${generatedHeadline?.length} chars), using fallback`);
      // Fallback: use first 80 chars of title
      return title.length > 80 ? title.substring(0, 77) + "..." : title;
    }
  } catch (error) {
    console.error("Failed to generate short headline:", error);
    // Fallback: use first 80 chars of title
    return title.length > 80 ? title.substring(0, 77) + "..." : title;
  }
}

/**
 * Generate sensationalized "yellow press" style news text for video overlay
 * Takes original title and summary, returns catchy Spanish text optimized for shorts
 */
async function generateYellowPressText(
  title: string,
  summary: string
): Promise<string> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Eres un experto en crear textos sensacionalistas para prensa del corazón española.

Título original: ${title}
Resumen: ${summary}

TAREA:
Crea un texto SENSACIONALISTA y DETALLADO en estilo de revista del corazón (¡Hola!, Diez Minutos) que se superpondrá sobre una foto en un video corto.

REQUISITOS ESTRICTOS:
- Longitud: 540-660 caracteres (incluyendo espacios)
- Estilo amarillista/sensacionalista de prensa del corazón
- Usar palabras impactantes: "EXCLUSIVA", "BOMBAZO", "¡INCREÍBLE!", "REVELACIÓN", etc.
- Emocional, dramático y llamativo
- En ESPAÑOL
- 3-5 frases con detalles jugosos
- Enfocarse en lo más escandaloso/emocionante de la noticia
- Añadir contexto dramático y detalles llamativos
- Usar signos de exclamación para énfasis

EJEMPLOS del estilo deseado (más extensos):
- "¡BOMBAZO en la Casa Real! La Reina Letizia ha dejado a TODOS sin palabras con un look NUNCA antes visto que rompe todas las reglas del protocolo. Los expertos en moda están ASOMBRADOS y la reacción del Rey Felipe no se ha hecho esperar. ¡Las imágenes dan la vuelta al mundo!"
- "EXCLUSIVA: Se confirma el romance secreto que NADIE esperaba. Las fotos comprometedoras que lo demuestran TODO han salido a la luz y la reacción de la familia ha sido EXPLOSIVA. ¡Los detalles que cambiarán todo lo que creías saber!"
- "¡ESCÁNDALO sin precedentes! La princesa ha roto el protocolo de la forma más INESPERADA y la Casa Real no sabe cómo reaccionar. Los testigos cuentan lo que realmente pasó esa noche. ¡La verdad que intentaron ocultar!"

Devuelve SOLO el texto sensacionalista, sin comillas ni explicaciones.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un redactor experto de prensa del corazón española, especializado en textos sensacionalistas y dramáticos que enganchan al lector.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 300, // Increased for longer text (540-660 chars)
    });

    const generatedText = response.choices[0]?.message?.content?.trim();

    if (generatedText && generatedText.length >= 400 && generatedText.length <= 750) {
      console.log(`✨ Generated yellow press text (${generatedText.length} chars): ${generatedText}`);
      return generatedText;
    } else {
      console.warn(`Generated text length out of range (${generatedText?.length} chars), using fallback`);
      // Fallback: use title + summary if generation fails
      const fallbackText = `${title} ${summary}`;
      return fallbackText.length > 660 ? fallbackText.substring(0, 657) + "..." : fallbackText;
    }
  } catch (error) {
    console.error("Failed to generate yellow press text:", error);
    // Fallback: use title + summary
    const fallbackText = `${title} ${summary}`;
    return fallbackText.length > 660 ? fallbackText.substring(0, 657) + "..." : fallbackText;
  }
}

/**
 * Main function to generate news video
 * @param userId - User ID
 * @param configId - News auto-generation config ID
 * @param scheduledAt - Scheduled publish time
 * @returns Created job
 */
export async function generateNewsVideo(
  userId: string,
  configId: string,
  scheduledAt: Date
): Promise<NewsAutoGenerationJob> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting News Video Generation ===`);
  console.log(`Job ID: ${jobId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Config ID: ${configId}`);
  console.log(`Scheduled At: ${scheduledAt.toISOString()}`);

  try {
    // 1. Get configuration
    console.log(`[${jobId}] Step 1: Fetching news auto-generation configuration...`);
    const config = await getNewsAutoGenerationConfig(userId);

    if (!config) {
      throw new Error("News auto-generation config not found");
    }

    if (!config.isEnabled) {
      throw new Error("News auto-generation is disabled");
    }

    // 2. Check available news
    console.log(`[${jobId}] Step 2: Checking available news...`);
    const availableNews = await getAvailableNewsCount();
    console.log(`Available news items: ${availableNews}`);

    if (availableNews === 0) {
      throw new Error("No news available for generation");
    }

    // 3. Reserve news item
    console.log(`[${jobId}] Step 3: Reserving news item...`);
    const news = await selectNextNews();

    if (!news) {
      throw new Error("Failed to reserve news item");
    }

    const newsTitle = news.editedTitle || news.title;
    const newsSummary = news.editedSummary || news.summary;
    const newsImageUrl = news.editedImageUrl || news.imageUrl;

    console.log(`Selected news ID: ${news._id}`);
    console.log(`Title: ${newsTitle}`);
    console.log(`Summary (${newsSummary.length} chars): ${newsSummary.substring(0, 100)}...`);
    console.log(`Image URL: ${newsImageUrl}`);

    // 4. Generate short headline and sensationalized text for video overlay
    console.log(`[${jobId}] Step 4: Generating short headline and sensationalized text...`);
    const [shortHeadline, videoOverlayText] = await Promise.all([
      generateShortHeadline(newsTitle, newsSummary),
      generateYellowPressText(newsTitle, newsSummary),
    ]);
    console.log(`Short headline: ${shortHeadline}`);
    console.log(`Video overlay text: ${videoOverlayText}`);

    // 5. Prepare audio (if configured)
    console.log(`[${jobId}] Step 5: Preparing audio...`);
    let audioUrl: string | undefined;
    let audioTrimStart: number | undefined;
    let audioTrimEnd: number | undefined;

    if (config.template.audio && config.template.audio.urls.length > 0) {
      const selectedAudioUrl = selectRandomFromArray(config.template.audio.urls);
      const targetDuration = config.template.audio.duration || 8;

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
      } else {
        console.log("No audio URL selected from array");
      }
    } else {
      console.log("No audio configured, generating video without audio");
    }

    // 6. Create job record
    console.log(`[${jobId}] Step 6: Creating job record...`);
    const job = await createNewsAutoGenerationJob({
      userId,
      configId: String(config._id),
      status: "processing",
      newsId: String(news._id),
      newsTitle,
      newsSummary,
      newsImageUrl,
      selectedResources: {
        audioUrl,
        audioTrimStart,
        audioTrimEnd,
      },
      retryCount: 0,
    });

    console.log(`Job created with ID: ${job._id}`);

    // 7. Render video
    console.log(`[${jobId}] Step 7: Rendering news video...`);
    const renderResult = await renderNewsVideo({
      celebrityImageUrl: newsImageUrl,
      shortHeadline, // Short headline in rounded rectangle
      newsTitle: videoOverlayText, // Use generated sensationalized text instead of original title
      newsSummary, // Keep original summary for metadata
      audioUrl,
      audioTrimStart,
      audioTrimEnd,
      duration: config.template.audio?.duration || 8,
      jobId,
    });

    console.log(`Video rendered successfully: ${renderResult.videoUrl}`);
    console.log(`Video duration: ${renderResult.duration}s`);

    // 8. Generate YouTube metadata using AI (if enabled)
    console.log(`[${jobId}] Step 8: Generating YouTube metadata...`);
    let youtubeTitle = newsTitle;
    let youtubeDescription = newsSummary;

    if (config.youtube.useAI) {
      try {
        // Use news-specific OpenAI-based title/description generators
        const [generatedTitle, generatedDescription] = await Promise.all([
          generateNewsShortsTitle(newsTitle, newsSummary),
          generateNewsShortsDescription(newsTitle, newsSummary),
        ]);

        youtubeTitle = generatedTitle;
        youtubeDescription = generatedDescription;

        console.log(`AI-generated news title: ${youtubeTitle}`);
        console.log(`AI-generated news description: ${youtubeDescription.substring(0, 100)}...`);
      } catch (aiError) {
        console.error("Failed to generate AI metadata, using original:", aiError);
        // Continue with original title and description
      }
    }

    // 9. Add to scheduled videos
    console.log(`[${jobId}] Step 9: Adding to scheduled videos...`);

    // Determine which channel ID to use (priority: savedChannelId > manualChannelId > channelId)
    const channelIdToUse =
      config.youtube.savedChannelId ||
      config.youtube.manualChannelId ||
      config.youtube.channelId;

    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: renderResult.videoUrl,
      title: youtubeTitle,
      description: youtubeDescription,
      tags: config.youtube.tags || ["noticias", "famosos", "españa", "celebrities"],
      privacyStatus: config.youtube.privacyStatus || "public",
      scheduledAt,
      youtubeChannelId: channelIdToUse,
      newsId: String(news._id), // Link to news source
      language: "es", // Mark as Spanish news video
    });

    console.log(`Video scheduled for: ${scheduledAt.toISOString()}`);

    // 10. Update job status
    console.log(`[${jobId}] Step 10: Updating job status...`);
    await updateNewsJobStatus(job._id!, "completed", {
      results: {
        renderedVideoUrl: renderResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    // 11. Mark news as used
    console.log(`[${jobId}] Step 11: Marking news as used...`);
    await markNewsCandidateStatus({
      id: news._id,
      status: "used",
    });

    // 12. Increment generated count
    await incrementNewsGeneratedCount(config._id!);

    console.log(`\n=== News Video Generation Completed Successfully ===`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Video URL: ${renderResult.videoUrl}`);
    console.log(`Scheduled At: ${scheduledAt.toISOString()}\n`);

    return job;
  } catch (error) {
    console.error(`\n=== News Video Generation Failed ===`);
    console.error(`Job ID: ${jobId}`);
    console.error(`Error:`, error);

    // Try to create or update job with error status
    try {
      const existingJob = await createNewsAutoGenerationJob({
        userId,
        configId,
        status: "failed",
        newsId: "",
        newsTitle: "",
        newsSummary: "",
        newsImageUrl: "",
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
