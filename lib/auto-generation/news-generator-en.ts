import { ObjectId } from "mongodb";
import {
  getNewsAutoGenerationConfig,
  createNewsAutoGenerationJob,
  updateNewsJobStatus,
  incrementNewsGeneratedCount,
  NewsAutoGenerationJob,
} from "@/lib/db/auto-generation-news-en";
import { addScheduledVideo } from "@/lib/db/users";
import { markNewsCandidateStatusEN, findNewsCandidateByIdEN } from "@/lib/ingest-news/storage-en";
import { selectNextNewsEN as selectNextNews, getAvailableNewsCountEN as getAvailableNewsCount } from "./news-selector-en";
import { prepareAudioCut, selectRandomFromArray } from "./audio-processor";
import { renderNewsVideo } from "@/lib/video/renderer-new";
import { generateNewsShortsTitle_EN, generateNewsShortsDescription_EN } from "@/lib/youtube/title-generator";
import { generateNewsTagsEN } from "./news-tags-en";

/**
 * Generate short catchy headline for video (max 1 line)
 * Takes original title and summary, returns short English headline
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

    const prompt = `You are an expert at creating impactful headlines for English celebrity tabloid press.

Original title: ${title}
Summary: ${summary}

TASK:
Create a SHORT and CATCHY headline in ONE LINE.

STRICT REQUIREMENTS:
- ONE LINE only, no line breaks
- MAX 80 characters (including spaces)
- Tabloid sensationalist style
- KEY WORDS in CAPS
- In ENGLISH

EXAMPLES of the desired style:
- "BOMBSHELL at the Royal Palace! Secret romance confirmed"
- "SCANDAL! TV host walks off the show live"
- "REVEALED! The secret that destroyed the royal family"

Return ONLY the headline in one line, no quotes or explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert editor for English celebrity tabloid press, specialized in short and catchy headlines.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

    });

    console.log(`🔍 Raw headline response:`, JSON.stringify(response.choices[0]?.message));

    const generatedHeadline = response.choices[0]?.message?.content
      ?.replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (generatedHeadline && generatedHeadline.length >= 20 && generatedHeadline.length <= 80) {
      console.log(`✨ Generated short headline (${generatedHeadline.length} chars): ${generatedHeadline}`);
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

/**
 * Generate sensationalized "yellow press" style news text for video overlay
 * Takes original title and summary, returns catchy English text optimized for shorts
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

    const prompt = `You are an expert at creating tabloid-style celebrity gossip texts in English.

Original title: ${title}
Summary: ${summary}

TASK:
Create a SENSATIONALIST and DETAILED text in English tabloid style that will be overlaid on a photo in a short video. Start with a HOOK and then unfold the story with concrete facts.

STRUCTURE:
1) FIRST SENTENCE: sensationalist hook (can use BOMBSHELL!, SCANDAL!, etc. if the facts justify it)
2) DEVELOPMENT: short sentences with real facts — dates, places, names, quotes if available
3) CLOSING: rhetorical question that invites reflection

STRICT REQUIREMENTS:
- MANDATORY MINIMUM length: 540 characters (including spaces). NEVER less than 540.
- MAXIMUM length: 660 characters (including spaces)
- If your text has fewer than 540 characters, ADD more details, facts, context or quotes until reaching the minimum
- Impactful words must be backed by facts, not used in a vacuum
- SHORT sentences. One idea per sentence.
- End with a rhetorical question
- In ENGLISH

EXAMPLES of the desired style:
- "BOMBSHELL that rocked Hollywood! Los Angeles, 2023. The A-list couple everyone thought was unbreakable just shattered into pieces. Sources close to the family reveal heated arguments behind closed doors. The paparazzi caught them leaving separate hotels. Their publicist refuses to comment. Friends say the warning signs were there all along. Will they ever find their way back to each other?"
- "SCANDAL that shocked the entertainment world! The beloved TV star was caught in a web of lies that nobody saw coming. Leaked documents reveal a secret life hidden for years. Former colleagues are speaking out for the first time. The evidence is overwhelming and the fallout is just beginning. Can their career survive this devastating revelation?"

Return ONLY the text, no quotes or explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert editor for English celebrity tabloid press, specialized in sensationalist and dramatic texts that hook the reader.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

    });

    console.log(`🔍 Raw yellow press response:`, JSON.stringify(response.choices[0]?.message));

    const generatedText = response.choices[0]?.message?.content?.trim();

    if (generatedText && generatedText.length >= 400 && generatedText.length <= 750) {
      console.log(`✨ Generated yellow press text (${generatedText.length} chars): ${generatedText}`);
      return generatedText;
    } else {
      console.warn(`Generated text length out of range (${generatedText?.length} chars), using fallback`);
      const fallbackText = `${title} ${summary}`;
      return fallbackText.length > 660 ? fallbackText.substring(0, 657) + "..." : fallbackText;
    }
  } catch (error) {
    console.error("Failed to generate yellow press text:", error);
    const fallbackText = `${title} ${summary}`;
    return fallbackText.length > 660 ? fallbackText.substring(0, 657) + "..." : fallbackText;
  }
}

/**
 * Main function to generate English news video
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

  console.log(`\n=== Starting English News Video Generation ===`);
  console.log(`Job ID: ${jobId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Config ID: ${configId}`);
  console.log(`Scheduled At: ${scheduledAt.toISOString()}`);
  if (specificNewsId) {
    console.log(`Specific News ID: ${specificNewsId}`);
  }

  let news: Awaited<ReturnType<typeof selectNextNews>> | Awaited<ReturnType<typeof findNewsCandidateByIdEN>>;

  try {
    // 1. Get configuration
    console.log(`[${jobId}] Step 1: Fetching English news auto-generation configuration...`);
    const config = await getNewsAutoGenerationConfig(userId);

    if (!config) {
      throw new Error("English news auto-generation config not found");
    }

    if (!specificNewsId && !config.isEnabled) {
      throw new Error("English news auto-generation is disabled");
    }

    // 2. Check available news (skip when using specific news ID)
    if (!specificNewsId) {
      console.log(`[${jobId}] Step 2: Checking available English news...`);
      const availableNews = await getAvailableNewsCount();
      console.log(`Available English news items: ${availableNews}`);

      if (availableNews === 0) {
        throw new Error("No English news available for generation");
      }
    }

    // 3. Reserve news item
    console.log(`[${jobId}] Step 3: Reserving English news item...`);
    if (specificNewsId) {
      news = await findNewsCandidateByIdEN(specificNewsId);
      if (!news) {
        throw new Error(`English news item ${specificNewsId} not found`);
      }
      await markNewsCandidateStatusEN({ id: specificNewsId, status: "reserved" });
    } else {
      news = await selectNextNews();
    }

    if (!news) {
      throw new Error("Failed to reserve English news item");
    }

    const newsTitle = news.editedTitle || news.title;
    const newsSummary = news.editedSummary || news.summary;
    const newsImageUrl = news.editedImageUrl || news.imageUrl;

    console.log(`Selected English news ID: ${news._id}`);
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
    console.log(`[${jobId}] Step 7: Rendering English news video...`);
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

    // 8. Generate YouTube metadata using AI (if enabled)
    console.log(`[${jobId}] Step 8: Generating YouTube metadata...`);
    let youtubeTitle = newsTitle;
    let youtubeDescription = newsSummary;

    if (config.youtube.useAI) {
      try {
        const [generatedTitle, generatedDescription] = await Promise.all([
          generateNewsShortsTitle_EN(newsTitle, newsSummary),
          generateNewsShortsDescription_EN(newsTitle, newsSummary),
        ]);

        youtubeTitle = generatedTitle;
        youtubeDescription = generatedDescription;

        console.log(`AI-generated English news title: ${youtubeTitle}`);
        console.log(`AI-generated English news description: ${youtubeDescription.substring(0, 100)}...`);
      } catch (aiError) {
        console.error("Failed to generate AI metadata, using original:", aiError);
      }
    }

    // Add music attribution if audio is used
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

    // 9. Add to scheduled videos
    console.log(`[${jobId}] Step 9: Adding to scheduled videos...`);

    const channelIdToUse =
      config.youtube.savedChannelId ||
      config.youtube.manualChannelId ||
      config.youtube.channelId;

    const scheduledVideo = await addScheduledVideo(userId, {
      videoUrl: renderResult.videoUrl,
      title: youtubeTitle,
      description: youtubeDescription,
      tags: await generateNewsTagsEN(newsTitle, newsSummary, config.youtube.tags),
      privacyStatus: config.youtube.privacyStatus || "public",
      scheduledAt,
      youtubeChannelId: channelIdToUse,
      newsId: String(news._id),
      language: "en",
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
    console.log(`[${jobId}] Step 11: Marking English news as used...`);
    await markNewsCandidateStatusEN({
      id: news._id,
      status: "used",
    });

    // 12. Increment generated count
    await incrementNewsGeneratedCount(config._id!);

    console.log(`\n=== English News Video Generation Completed Successfully ===`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Video URL: ${renderResult.videoUrl}`);
    console.log(`Scheduled At: ${scheduledAt.toISOString()}\n`);

    return job;
  } catch (error) {
    console.error(`\n=== English News Video Generation Failed ===`);
    console.error(`Job ID: ${jobId}`);
    console.error(`Error:`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (news && news._id) {
      try {
        await markNewsCandidateStatusEN({
          id: news._id,
          status: "pending",
          notes: `[${new Date().toISOString()}] Generation failed (job ${jobId}): ${errorMessage}`,
        });
        console.log(`Reset English news ${news._id} back to pending with error note`);
      } catch (resetError) {
        console.error(`Failed to reset English news ${news._id} status:`, resetError);
      }
    }

    try {
      const existingJob = await createNewsAutoGenerationJob({
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
