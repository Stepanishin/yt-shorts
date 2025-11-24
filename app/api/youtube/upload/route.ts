import { NextRequest, NextResponse } from "next/server";
import { uploadVideoToYouTube } from "@/lib/youtube/youtube-client";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { auth } from "@/lib/auth";
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { videoUrl, title, description, tags, privacyStatus, jokeId } = body;

    if (!videoUrl || !title) {
      return NextResponse.json(
        { error: "videoUrl and title are required" },
        { status: 400 }
      );
    }

    // Get authenticated YouTube client for the user (with automatic token refresh)
    const { oauth2Client, user } = await getUserYouTubeClient(session.user.id);

    // Use user's default settings if not specified
    const finalPrivacyStatus = privacyStatus || user.youtubeSettings?.defaultPrivacyStatus || "public";
    const finalTags = tags || user.youtubeSettings?.defaultTags || ["shorts", "comedy", "funny"];

    // Преобразуем URL в локальный путь к файлу
    // videoUrl выглядит как /videos/final_xxx.mp4
    const videoPath = path.join(process.cwd(), "public", videoUrl);

    console.log(`Uploading video to YouTube: ${title}`);
    console.log(`Video path: ${videoPath}`);
    console.log(`User: ${user.email}`);

    // Загружаем видео
    const result = await uploadVideoToYouTube({
      oauth2Client,
      videoPath,
      title,
      description: description || `${title}\n\nGenerated with AI`,
      tags: finalTags,
      privacyStatus: finalPrivacyStatus,
    });

    console.log(`Video uploaded successfully: ${result.videoUrl}`);

    // Обновляем статус анекдота на "used" после успешной публикации (только если это анекдот)
    if (jokeId && !jokeId.startsWith("constructor-")) {
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
