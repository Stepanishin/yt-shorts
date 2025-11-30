import { NextRequest, NextResponse } from "next/server";
import { uploadVideoToYouTube } from "@/lib/youtube/youtube-client";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { auth } from "@/lib/auth";
import * as path from "path";
import * as fs from "fs/promises";
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

    console.log(`Uploading video to YouTube: ${title}`);
    console.log(`Video URL: ${videoUrl}`);
    console.log(`User: ${user.email}`);

    // Определяем, является ли videoUrl полным URL или относительным путем
    let videoPath: string;
    
    if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
      // Это полный URL из DigitalOcean Spaces - нужно скачать файл
      console.log("Downloading video from Spaces...");
      
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video from Spaces: ${response.statusText}`);
      }

      // Создаем временный файл
      const tempDir = process.env.NODE_ENV === 'production' 
        ? '/tmp/videos' 
        : path.join(process.cwd(), "public", "videos");
      await fs.mkdir(tempDir, { recursive: true });
      
      const tempFileName = `youtube_upload_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
      videoPath = path.join(tempDir, tempFileName);
      
      // Сохраняем файл
      const buffer = await response.arrayBuffer();
      await fs.writeFile(videoPath, Buffer.from(buffer));
      
      console.log(`Video downloaded to: ${videoPath}`);
    } else {
      // Это относительный путь - используем как есть
      videoPath = path.join(process.cwd(), "public", videoUrl);
    }

    console.log(`Video path: ${videoPath}`);

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

    // Удаляем временный файл, если он был скачан из Spaces
    if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
      try {
        await fs.unlink(videoPath);
        console.log("Temporary video file deleted");
      } catch (error) {
        console.error("Failed to delete temporary file:", error);
        // Не критично, файл будет удален автоматически при очистке /tmp
      }
    }

    // Обновляем статус анекдота на "used" после успешной публикации (только если это анекдот)
    if (jokeId && !jokeId.startsWith("constructor-")) {
      try {
        console.log(`Attempting to mark joke ${jokeId} as used after YouTube upload`);
        await markJokeCandidateAsPublished({
          id: jokeId,
          youtubeVideoUrl: result.videoUrl,
          youtubeVideoId: result.videoId,
        });
        console.log(`✅ Joke ${jokeId} successfully marked as used and published`);
      } catch (dbError) {
        console.error(`❌ Failed to update joke ${jokeId} status:`, dbError);
        // Не прерываем выполнение, так как видео уже загружено, но логируем ошибку
        // Возвращаем предупреждение в ответе
        return NextResponse.json({
          success: true,
          videoId: result.videoId,
          videoUrl: result.videoUrl,
          title: result.title,
          warning: `Video uploaded successfully, but failed to mark joke as used: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
        });
      }
    } else if (jokeId) {
      console.log(`Skipping status update for constructor joke: ${jokeId}`);
    } else {
      console.log("No jokeId provided, skipping status update");
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
