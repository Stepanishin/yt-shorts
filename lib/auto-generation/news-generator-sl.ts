import { ObjectId } from "mongodb";
import {
  getNewsAutoGenerationConfigSL,
  createNewsAutoGenerationJobSL,
  updateNewsJobStatusSL,
  incrementNewsGeneratedCountSL,
  NewsAutoGenerationJobSL,
} from "@/lib/db/auto-generation-news-sl";
import { addScheduledVideo } from "@/lib/db/users";
import { markNewsCandidateStatusSL, findNewsCandidateByIdSL } from "@/lib/ingest-news/storage-sl";
import { selectNextNewsSL as selectNextNews, getAvailableNewsCountSL as getAvailableNewsCount } from "./news-selector-sl";
import { prepareAudioCut, selectRandomFromArray } from "./audio-processor";
import { renderNewsVideo } from "@/lib/video/renderer-new";
import { generateNewsShortsTitle_SL, generateNewsShortsDescription_SL } from "@/lib/youtube/title-generator";
import { generateNewsTagsSL } from "./news-tags-sl";

async function generateShortHeadline(
  title: string,
  summary: string
): Promise<string> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `You are an expert at creating impactful headlines for Slovenian news.

Original title: ${title}
Summary: ${summary}

TASK:
Create a SHORT and CATCHY headline in ONE LINE.

STRICT REQUIREMENTS:
- ONE LINE only, no line breaks
- MAX 80 characters (including spaces)
- Dramatic, attention-grabbing style
- KEY WORDS in CAPS
- In SLOVENIAN language

EXAMPLES of the desired style:
- "ŠOKANTNO odkritje v Ljubljani! Zvezdnik razkril resnico"
- "SKANDAL! Znani Slovenec zapustil državo"
- "RAZKRITO! Skrivnost, ki pretresa Slovenijo"

Return ONLY the headline in one line, no quotes or explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert editor for Slovenian news, specialized in short and catchy headlines. You write in fluent Slovenian.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const generatedHeadline = response.choices[0]?.message?.content
      ?.replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (generatedHeadline && generatedHeadline.length >= 20 && generatedHeadline.length <= 80) {
      console.log(`Generated short headline (${generatedHeadline.length} chars): ${generatedHeadline}`);
      return generatedHeadline;
    } else {
      console.warn(`Generated headline out of range (${generatedHeadline?.length} chars), using fallback`);
      return title.length > 80 ? title.substring(0, 77) + "..." : title;
    }
  } catch (error) {
    console.error("Failed to generate short headline:", error);
    return title.length > 80 ? title.substring(0, 77) + "..." : title;
  }
}

async function generateVideoOverlayText(
  title: string,
  summary: string
): Promise<string> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `You are an expert at creating engaging news texts in Slovenian.

Original title: ${title}
Summary: ${summary}

TASK:
Create a DRAMATIC and DETAILED text in Slovenian that will be overlaid on a photo in a short video. Start with a HOOK and then unfold the story with concrete facts.

STRUCTURE:
1) FIRST SENTENCE: dramatic hook
2) DEVELOPMENT: short sentences with real facts — dates, places, names, quotes if available
3) CLOSING: rhetorical question that invites reflection

STRICT REQUIREMENTS:
- MANDATORY MINIMUM length: 540 characters (including spaces). NEVER less than 540.
- MAXIMUM length: 660 characters (including spaces)
- If your text has fewer than 540 characters, ADD more details, facts, context or quotes until reaching the minimum
- SHORT sentences. One idea per sentence.
- End with a rhetorical question
- In SLOVENIAN language

Return ONLY the text, no quotes or explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert editor for Slovenian news, specialized in dramatic and engaging texts. You write in fluent Slovenian.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const generatedText = response.choices[0]?.message?.content?.trim();

    if (generatedText && generatedText.length >= 400 && generatedText.length <= 750) {
      console.log(`Generated overlay text (${generatedText.length} chars): ${generatedText}`);
      return generatedText;
    } else {
      console.warn(`Generated text length out of range (${generatedText?.length} chars), using fallback`);
      const fallbackText = `${title} ${summary}`;
      return fallbackText.length > 660 ? fallbackText.substring(0, 657) + "..." : fallbackText;
    }
  } catch (error) {
    console.error("Failed to generate overlay text:", error);
    const fallbackText = `${title} ${summary}`;
    return fallbackText.length > 660 ? fallbackText.substring(0, 657) + "..." : fallbackText;
  }
}

export async function generateNewsVideoSL(
  userId: string,
  configId: string,
  scheduledAt: Date,
  specificNewsId?: string
): Promise<NewsAutoGenerationJobSL> {
  const jobId = new ObjectId().toString();

  console.log(`\n=== Starting Slovenian News Video Generation ===`);
  console.log(`Job ID: ${jobId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Config ID: ${configId}`);
  console.log(`Scheduled At: ${scheduledAt.toISOString()}`);
  if (specificNewsId) {
    console.log(`Specific News ID: ${specificNewsId}`);
  }

  let news: Awaited<ReturnType<typeof selectNextNews>> | Awaited<ReturnType<typeof findNewsCandidateByIdSL>>;

  try {
    console.log(`[${jobId}] Step 1: Fetching Slovenian news auto-generation configuration...`);
    const config = await getNewsAutoGenerationConfigSL(userId);

    if (!config) {
      throw new Error("Slovenian news auto-generation config not found");
    }

    if (!specificNewsId && !config.isEnabled) {
      throw new Error("Slovenian news auto-generation is disabled");
    }

    if (!specificNewsId) {
      console.log(`[${jobId}] Step 2: Checking available Slovenian news...`);
      const availableNews = await getAvailableNewsCount();
      console.log(`Available Slovenian news items: ${availableNews}`);

      if (availableNews === 0) {
        throw new Error("No Slovenian news available for generation");
      }
    }

    console.log(`[${jobId}] Step 3: Reserving Slovenian news item...`);
    if (specificNewsId) {
      news = await findNewsCandidateByIdSL(specificNewsId);
      if (!news) {
        throw new Error(`Slovenian news item ${specificNewsId} not found`);
      }
      await markNewsCandidateStatusSL({ id: specificNewsId, status: "reserved" });
    } else {
      news = await selectNextNews();
    }

    if (!news) {
      throw new Error("Failed to reserve Slovenian news item");
    }

    const newsTitle = news.editedTitle || news.title;
    const newsSummary = news.editedSummary || news.summary;
    const newsImageUrl = news.editedImageUrl || news.imageUrl;

    console.log(`Selected Slovenian news ID: ${news._id}`);
    console.log(`Title: ${newsTitle}`);
    console.log(`Summary (${newsSummary.length} chars): ${newsSummary.substring(0, 100)}...`);
    console.log(`Image URL: ${newsImageUrl}`);

    console.log(`[${jobId}] Step 4: Generating short headline and overlay text...`);
    const [shortHeadline, videoOverlayText] = await Promise.all([
      generateShortHeadline(newsTitle, newsSummary),
      generateVideoOverlayText(newsTitle, newsSummary),
    ]);
    console.log(`Short headline: ${shortHeadline}`);
    console.log(`Video overlay text: ${videoOverlayText}`);

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

    console.log(`[${jobId}] Step 6: Creating job record...`);
    const job = await createNewsAutoGenerationJobSL({
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

    console.log(`[${jobId}] Step 7: Rendering Slovenian news video...`);
    const renderResult = await renderNewsVideo({
      celebrityImageUrl: newsImageUrl,
      shortHeadline,
      newsTitle: videoOverlayText,
      newsSummary,
      audioUrl,
      audioTrimStart,
      audioTrimEnd,
      duration: config.template.audio?.duration || 8,
      templateId: config.selectedTemplate || "template1",
      jobId,
    });

    console.log(`Video rendered successfully: ${renderResult.videoUrl}`);
    console.log(`Video duration: ${renderResult.duration}s`);

    console.log(`[${jobId}] Step 8: Generating YouTube metadata...`);
    let youtubeTitle = newsTitle;
    let youtubeDescription = newsSummary;

    if (config.youtube.useAI) {
      try {
        const [generatedTitle, generatedDescription] = await Promise.all([
          generateNewsShortsTitle_SL(newsTitle, newsSummary),
          generateNewsShortsDescription_SL(newsTitle, newsSummary),
        ]);

        youtubeTitle = generatedTitle;
        youtubeDescription = generatedDescription;

        console.log(`AI-generated Slovenian news title: ${youtubeTitle}`);
        console.log(`AI-generated Slovenian news description: ${youtubeDescription.substring(0, 100)}...`);
      } catch (aiError) {
        console.error("Failed to generate AI metadata, using original:", aiError);
      }
    }

    if (audioUrl) {
      let trackName = "Track";
      try {
        const fileName = decodeURIComponent(audioUrl.split("/").pop()?.split("?")[0] || "");
        if (fileName.endsWith(".mp3")) {
          trackName = fileName.replace(".mp3", "").replace(/[-_]/g, " ");
        }
      } catch { /* use default */ }
      youtubeDescription += `\n\nMusic: "${trackName}" by Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0 License\nhttp://creativecommons.org/licenses/by/4.0/`;
    }

    console.log(`[${jobId}] Step 9: Adding to scheduled videos...`);

    const channelIdToUse =
      config.youtube.savedChannelId ||
      config.youtube.manualChannelId ||
      config.youtube.channelId;

    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: renderResult.videoUrl,
      title: youtubeTitle,
      description: youtubeDescription,
      tags: await generateNewsTagsSL(newsTitle, newsSummary, config.youtube.tags),
      privacyStatus: config.youtube.privacyStatus || "public",
      scheduledAt,
      youtubeChannelId: channelIdToUse,
      newsId: String(news._id),
      language: "sl",
    });

    console.log(`Video scheduled for: ${scheduledAt.toISOString()}`);

    console.log(`[${jobId}] Step 10: Updating job status...`);
    await updateNewsJobStatusSL(job._id!, "completed", {
      results: {
        renderedVideoUrl: renderResult.videoUrl,
        scheduledVideoId: scheduledVideo.id,
        scheduledAt,
      },
    });

    console.log(`[${jobId}] Step 11: Marking Slovenian news as used...`);
    await markNewsCandidateStatusSL({
      id: news._id,
      status: "used",
    });

    await incrementNewsGeneratedCountSL(config._id!);

    console.log(`\n=== Slovenian News Video Generation Completed Successfully ===`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Video URL: ${renderResult.videoUrl}`);
    console.log(`Scheduled At: ${scheduledAt.toISOString()}\n`);

    return job;
  } catch (error) {
    console.error(`\n=== Slovenian News Video Generation Failed ===`);
    console.error(`Job ID: ${jobId}`);
    console.error(`Error:`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (news && news._id) {
      try {
        await markNewsCandidateStatusSL({
          id: news._id,
          status: "pending",
          notes: `[${new Date().toISOString()}] Generation failed (job ${jobId}): ${errorMessage}`,
        });
        console.log(`Reset Slovenian news ${news._id} back to pending with error note`);
      } catch (resetError) {
        console.error(`Failed to reset Slovenian news ${news._id} status:`, resetError);
      }
    }

    try {
      const existingJob = await createNewsAutoGenerationJobSL({
        userId,
        configId,
        status: "failed",
        newsId: news?._id ? String(news._id) : "",
        newsTitle: news?.title || "",
        newsSummary: news?.summary || "",
        newsImageUrl: news?.imageUrl || "",
        selectedResources: {},
        errorMessage,
        retryCount: 0,
      });

      return existingJob;
    } catch (dbError) {
      console.error("Failed to create error job record:", dbError);
      throw error;
    }
  }
}
