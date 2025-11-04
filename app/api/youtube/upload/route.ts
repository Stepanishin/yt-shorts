import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, uploadVideoToYouTube } from "@/lib/youtube/youtube-client";
import { cookies } from "next/headers";
import * as path from "path";
import { markJokeCandidateAsPublished } from "@/lib/ingest/storage";

/**
 * POST /api/youtube/upload
 * Загружает видео на YouTube
 *
 * Body: {
 *   videoUrl: string, // URL видео из /videos/final_*.mp4
 *   title: string,
 *   description?: string,
 *   tags?: string[],
 *   privacyStatus?: "private" | "public" | "unlisted"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("youtube_access_token")?.value;
    const refreshToken = cookieStore.get("youtube_refresh_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authorized. Please authorize with YouTube first." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { videoUrl, title, description, tags, privacyStatus = "public", jokeId } = body;

    if (!videoUrl || !title) {
      return NextResponse.json(
        { error: "videoUrl and title are required" },
        { status: 400 }
      );
    }

    if (!jokeId) {
      return NextResponse.json(
        { error: "jokeId is required" },
        { status: 400 }
      );
    }

    // Преобразуем URL в локальный путь к файлу
    // videoUrl выглядит как /videos/final_xxx.mp4
    const videoPath = path.join(process.cwd(), "public", videoUrl);

    // Создаем OAuth2 клиент и устанавливаем токены
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    console.log(`Uploading video to YouTube: ${title}`);
    console.log(`Video path: ${videoPath}`);

    // Загружаем видео
    const result = await uploadVideoToYouTube({
      oauth2Client,
      videoPath,
      title,
      description: description || `${title}\n\nGenerated with AI`,
      tags: tags || ["shorts", "comedy", "funny"],
      privacyStatus,
    });

    console.log(`Video uploaded successfully: ${result.videoUrl}`);

    // Обновляем статус анекдота на "used" после успешной публикации
    try {
      await markJokeCandidateAsPublished({
        id: jokeId,
        youtubeVideoUrl: result.videoUrl,
        youtubeVideoId: result.videoId,
      });

      console.log(`Joke ${jokeId} marked as used and published`);
    } catch (dbError) {
      console.error("Failed to update joke status:", dbError);
      // Не прерываем выполнение, так как видео уже загружено
    }

    return NextResponse.json({
      success: true,
      videoId: result.videoId,
      videoUrl: result.videoUrl,
      title: result.title,
    });
  } catch (error: any) {
    console.error("YouTube upload error:", error);

    // Если ошибка связана с авторизацией, просим переавторизоваться
    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      return NextResponse.json(
        { error: "Authorization expired. Please authorize again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to upload video to YouTube",
        details: error.message
      },
      { status: 500 }
    );
  }
}
