import { NextResponse } from "next/server";
import { reserveNextJokeCandidate } from "@/lib/ingest/storage";
import { createVideoJob, updateVideoJobStatus } from "@/lib/video/storage";
import { processVideoJob } from "@/lib/video/processor";
import { renderFinalVideo } from "@/lib/video/renderer";
import { uploadVideoToYouTube, createOAuth2Client } from "@/lib/youtube/youtube-client";
import { markJokeCandidateAsPublished } from "@/lib/ingest/storage";
import { generateShortsTitle, generateShortsDescription } from "@/lib/youtube/title-generator";
import { cookies } from "next/headers";
import * as path from "path";

/**
 * POST /api/videos/batch
 * Массовая обработка анекдотов - генерация видео, рендеринг и публикация на YouTube
 *
 * Body: {
 *   count?: number, // Количество анекдотов для обработки (если не указаны jokeIds)
 *   jokeIds?: string[], // Конкретные ID анекдотов для обработки
 *   language?: string,
 *   sources?: string[],
 *   privacyStatus?: "private" | "public" | "unlisted"
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { count = 1, jokeIds, language = "es", sources, privacyStatus = "public" } = body;

    // Валидация входных параметров
    if (jokeIds && jokeIds.length > 0) {
      if (jokeIds.length > 10) {
        return NextResponse.json(
          { error: "Maximum 10 jokes can be processed at once" },
          { status: 400 }
        );
      }
    } else {
      if (count < 1 || count > 10) {
        return NextResponse.json(
          { error: "Count must be between 1 and 10" },
          { status: 400 }
        );
      }
    }

    // Проверяем авторизацию YouTube
    const cookieStore = await cookies();
    let accessToken = cookieStore.get("youtube_access_token")?.value;
    const refreshToken = cookieStore.get("youtube_refresh_token")?.value;

    // Если нет access token, но есть refresh token - обновляем
    if (!accessToken && refreshToken) {
      console.log("Access token missing, attempting to refresh...");
      try {
        const oauth2Client = createOAuth2Client();
        oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        if (credentials.access_token) {
          accessToken = credentials.access_token;
          cookieStore.set("youtube_access_token", credentials.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60,
          });
          console.log("Access token refreshed successfully");
        }
      } catch (refreshError) {
        console.error("Failed to refresh access token:", refreshError);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authorized. Please authorize with YouTube first." },
        { status: 401 }
      );
    }

    const allowedSources = Array.isArray(sources)
      ? (sources.filter((value) =>
          value === "chistes" || value === "yavendras" || value === "todochistes"
        ) as ("chistes" | "yavendras" | "todochistes")[])
      : undefined;

    // Создаем OAuth2 клиент
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const results = [];
    const errors = [];

    // Определяем список анекдотов для обработки
    const jokesToProcess: any[] = [];

    if (jokeIds && jokeIds.length > 0) {
      // Режим с конкретными ID
      console.log(`Processing ${jokeIds.length} specific jokes`);
      const { findJokeCandidateById, markJokeCandidateStatus } = await import("@/lib/ingest/storage");

      for (const jokeId of jokeIds) {
        const joke = await findJokeCandidateById(jokeId);
        if (joke) {
          // Резервируем анекдот, если он еще не зарезервирован
          if (joke.status !== "reserved") {
            await markJokeCandidateStatus({ id: jokeId, status: "reserved" });
          }
          jokesToProcess.push({ ...joke, _id: jokeId });
        } else {
          errors.push({ index: jokesToProcess.length + 1, error: `Joke ${jokeId} not found` });
        }
      }
    } else {
      // Режим с автоматическим резервированием
      console.log(`Processing ${count} jokes automatically`);
      for (let i = 0; i < count; i++) {
        const candidate = await reserveNextJokeCandidate({
          language,
          sources: allowedSources
        });

        if (!candidate) {
          console.log(`No more jokes available (${i}/${count} processed)`);
          errors.push({ index: i + 1, error: "No joke available" });
          break;
        }
        jokesToProcess.push(candidate);
      }
    }

    // Обрабатываем каждый анекдот последовательно
    for (let i = 0; i < jokesToProcess.length; i++) {
      const candidate = jokesToProcess[i];

      try {
        console.log(`\n=== Processing joke ${i + 1}/${jokesToProcess.length} ===`);
        console.log(`Joke ID: ${candidate._id}`);

        // Создаем video job
        const job = await createVideoJob({
          jokeId: String(candidate._id),
          jokeSource: candidate.source,
          jokeText: candidate.text,
          jokeTitle: candidate.title,
          jokeMeta: candidate.meta,
          editedText: candidate.editedText,
          status: "pending",
        });

        console.log(`Created video job: ${job._id}`);

        // Генерируем фон и аудио
        await processVideoJob(job._id);

        // Ждем завершения генерации (проверяем статус)
        const { findVideoJobById } = await import("@/lib/video/storage");
        let updatedJob = await findVideoJobById(job._id);
        let attempts = 0;
        const maxAttempts = 60; // 5 минут максимум (60 * 5 секунд)

        while (updatedJob?.status === "running" && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          updatedJob = await findVideoJobById(job._id);
          attempts++;
        }

        if (updatedJob?.status !== "completed") {
          throw new Error(`Video job failed or timed out: ${updatedJob?.status}`);
        }

        console.log(`Video job completed: ${updatedJob._id}`);

        // 4. Рендерим финальное видео
        if (!updatedJob.backgroundVideoUrl) {
          throw new Error("Background video URL is missing");
        }

        await updateVideoJobStatus({
          id: updatedJob._id,
          status: updatedJob.status,
          renderingStatus: "running",
        });

        const laughingEmojis = ["😂", "🤣", "😆", "😄", "😃", "😊", "😁", "😀", "🤪", "😜", "🥳", "😋"];
        const emoji = laughingEmojis[Math.floor(Math.random() * laughingEmojis.length)];

        const renderResult = await renderFinalVideo({
          backgroundVideoUrl: updatedJob.backgroundVideoUrl,
          jokeTitle: updatedJob.jokeTitle,
          editedText: updatedJob.editedText || updatedJob.jokeText,
          emoji,
          audioUrl: updatedJob.audioUrl,
          jobId: String(updatedJob._id),
        });

        await updateVideoJobStatus({
          id: updatedJob._id,
          status: updatedJob.status,
          renderingStatus: "completed",
          finalVideoUrl: renderResult.videoUrl,
        });

        console.log(`Video rendered: ${renderResult.videoUrl}`);

        // 5. Генерируем заголовок и описание для YouTube
        const [youtubeTitle, youtubeDescription] = await Promise.all([
          generateShortsTitle(
            updatedJob.editedText || updatedJob.jokeText,
            updatedJob.jokeTitle
          ),
          generateShortsDescription(updatedJob.editedText || updatedJob.jokeText)
        ]);

        console.log(`Generated YouTube title: ${youtubeTitle}`);
        console.log(`Generated YouTube description: ${youtubeDescription.substring(0, 100)}...`);

        // 6. Загружаем на YouTube
        const videoPath = path.join(process.cwd(), "public", renderResult.videoUrl);

        const uploadResult = await uploadVideoToYouTube({
          oauth2Client,
          videoPath,
          title: youtubeTitle,
          description: youtubeDescription,
          tags: ["shorts", "comedy", "funny", "humor"],
          privacyStatus,
        });

        console.log(`Uploaded to YouTube: ${uploadResult.videoUrl}`);

        // 7. Помечаем анекдот как опубликованный
        await markJokeCandidateAsPublished({
          id: candidate._id,
          youtubeVideoUrl: uploadResult.videoUrl,
          youtubeVideoId: uploadResult.videoId,
        });

        results.push({
          index: i + 1,
          jokeId: String(candidate._id),
          jobId: String(job._id),
          youtubeUrl: uploadResult.videoUrl,
          youtubeId: uploadResult.videoId,
          title: youtubeTitle,
        });

        console.log(`=== Successfully processed joke ${i + 1}/${count} ===\n`);
      } catch (error) {
        console.error(`Error processing joke ${i + 1}:`, error);
        errors.push({
          index: i + 1,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // Продолжаем обработку следующих анекдотов
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      total: jokesToProcess.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Batch processing error:", error);
    return NextResponse.json(
      {
        error: "Failed to process batch",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
