import { ObjectId } from "mongodb";
import {
  getNewsAutoGenerationConfig,
  createNewsAutoGenerationJob,
  updateNewsJobStatus,
  incrementNewsGeneratedCount,
  NewsAutoGenerationJob,
} from "@/lib/db/auto-generation-news";
import { addScheduledVideo } from "@/lib/db/users";
import { markNewsCandidateStatus, findNewsCandidateById } from "@/lib/ingest-news/storage";
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
Crea un titular CORTO y LLAMATIVO en UNA SOLA LÍNEA.

REQUISITOS ESTRICTOS:
- UNA SOLA LÍNEA, sin saltos de línea
- Longitud MÁXIMA: 80 caracteres (cuenta los espacios)
- Estilo sensacionalista de prensa del corazón
- En MAYÚSCULAS las palabras clave
- En ESPAÑOL

EJEMPLOS del estilo deseado:
- "¡BOMBAZO en la Casa Real! Romance secreto confirmado"
- "¡ESCÁNDALO! La presentadora abandona el programa en directo"
- "¡REVELACIÓN! El secreto que destruyó la familia real"

Devuelve SOLO el titular en una línea, sin comillas ni explicaciones.`;

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

    // Strip newlines just in case GPT ignores the one-line instruction
    const generatedHeadline = response.choices[0]?.message?.content
      ?.replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (generatedHeadline && generatedHeadline.length >= 20 && generatedHeadline.length <= 80) {
      console.log(`✨ Generated short headline (${generatedHeadline.length} chars): ${generatedHeadline}`);
      return generatedHeadline;
    } else {
      console.warn(`Generated headline out of range (${generatedHeadline?.length} chars), using fallback`);
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

    const prompt = `Eres un experto en crear textos narrativos y dramáticos para prensa del corazón española.

Título original: ${title}
Resumen: ${summary}

TAREA:
Crea un texto narrativo y EMOCIONALMENTE PODEROSO que se superpondrá sobre una foto en un video corto. El drama surge de los HECHOS, no de adjetivos vacíos.

REQUISITOS ESTRICTOS:
- Longitud: 540-660 caracteres (incluyendo espacios)
- Estilo cinematográfico: cuenta una historia, no una lista de sensaciones
- PROHIBIDO usar: "EXCLUSIVA", "BOMBAZO", "REVELACIÓN", "INCREÍBLE", "ASOMBROSO"
- Empezar con un dato concreto: fecha, lugar, o hecho impactante
- Frases CORTAS que golpean. Una idea por frase.
- Detalles específicos: nombres completos, lugares, números, citas textuales si las hay
- Terminar con una pregunta retórica que invite a reflexionar
- En ESPAÑOL

EJEMPLOS del estilo deseado:
- "Madrid, 2007. Emma Penella se apagaba para siempre. Era la vecina gruñona más querida de España. Pero detrás de su sonrisa ácida, cargaba una cruz insoportable. Su padre era el hombre que entregó a Federico García Lorca para ser fusilado. Emma vivió huyendo de esa sombra. Se cambió el nombre. Ocultó su origen. Murió con miedo a ser juzgada por un crimen que no cometió. ¿Creen que los hijos deben pagar por los pecados de sus padres?"
- "Solo pasaron 14 días. Lola Flores murió y su hijo Antonio quedó devastado. 'Ella me espera', repetía con la mirada perdida. Se encerró en la cabaña familiar. Dos semanas de agonía. Lo encontraron sin vida en la misma casa donde su madre partió. Los médicos dijeron que fue un accidente. España sabe la verdad."

Devuelve SOLO el texto narrativo, sin comillas ni explicaciones.`;

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
 * @param specificNewsId - Optional specific news ID to generate video for (bypasses auto-selection)
 * @returns Created job
 */
export async function generateNewsVideo(
  userId: string,
  configId: string,
  scheduledAt: Date,
  specificNewsId?: string
): Promise<NewsAutoGenerationJob> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting News Video Generation ===`);
  console.log(`Job ID: ${jobId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Config ID: ${configId}`);
  console.log(`Scheduled At: ${scheduledAt.toISOString()}`);
  if (specificNewsId) {
    console.log(`Specific News ID: ${specificNewsId}`);
  }

  try {
    // 1. Get configuration
    console.log(`[${jobId}] Step 1: Fetching news auto-generation configuration...`);
    const config = await getNewsAutoGenerationConfig(userId);

    if (!config) {
      throw new Error("News auto-generation config not found");
    }

    if (!specificNewsId && !config.isEnabled) {
      throw new Error("News auto-generation is disabled");
    }

    // 2. Check available news (skip when using specific news ID)
    if (!specificNewsId) {
      console.log(`[${jobId}] Step 2: Checking available news...`);
      const availableNews = await getAvailableNewsCount();
      console.log(`Available news items: ${availableNews}`);

      if (availableNews === 0) {
        throw new Error("No news available for generation");
      }
    }

    // 3. Reserve news item
    console.log(`[${jobId}] Step 3: Reserving news item...`);
    let news;
    if (specificNewsId) {
      news = await findNewsCandidateById(specificNewsId);
      if (!news) {
        throw new Error(`News item ${specificNewsId} not found`);
      }
      // Reserve it manually
      await markNewsCandidateStatus({ id: specificNewsId, status: "reserved" });
    } else {
      news = await selectNextNews();
    }

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
      templateId: config.selectedTemplate || "template1",
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
