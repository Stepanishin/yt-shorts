import { NextRequest, NextResponse } from "next/server";
import { getScheduledVideosForPublishing, updateScheduledVideoStatus } from "@/lib/db/users";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { uploadVideoToYouTube } from "@/lib/youtube/youtube-client";
import { markJokeCandidateAsPublished } from "@/lib/ingest/storage";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * GET /api/cron/publish-scheduled
 * API endpoint для ручной публикации запланированных видео
 *
 * Автоматическая публикация происходит через scheduler каждые 10 минут
 * Этот endpoint можно вызвать вручную для немедленной публикации
 */
export async function GET(request: NextRequest) {
  try {

    console.log("🕐 Running scheduled video publishing cron job...");

    const videosToPublish = await getScheduledVideosForPublishing();

    console.log(`Found ${videosToPublish.length} videos ready to publish`);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ videoId: string; error: string }>,
    };

    for (const { userId, video, user } of videosToPublish) {
      try {
        console.log(`\n📤 Publishing video ${video.id} for user ${userId}...`);
        console.log(`   Title: ${video.title}`);
        console.log(`   Scheduled: ${video.scheduledAt}`);

        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        if (!user.youtubeSettings?.accessToken) {
          throw new Error("YouTube not authorized for this user");
        }

        // Обновляем статус на "publishing"
        await updateScheduledVideoStatus(userId, video.id, "publishing");

        // Получаем YouTube клиент с автоматическим обновлением токенов (используем googleId)
        const { oauth2Client } = await getUserYouTubeClient(user.googleId);

        // Определяем путь к видео
        let videoPath: string;

        if (video.videoUrl.startsWith("http://") || video.videoUrl.startsWith("https://")) {
          // Скачиваем видео из S3/URL
          console.log("   Downloading video from URL...");

          const response = await fetch(video.videoUrl);
          if (!response.ok) {
            throw new Error(`Failed to download video: ${response.statusText}`);
          }

          const tempDir = process.env.NODE_ENV === 'production'
            ? '/tmp/videos'
            : path.join(process.cwd(), "public", "videos");
          await fs.mkdir(tempDir, { recursive: true });

          const tempFileName = `scheduled_${video.id}_${Date.now()}.mp4`;
          videoPath = path.join(tempDir, tempFileName);

          const buffer = await response.arrayBuffer();
          await fs.writeFile(videoPath, Buffer.from(buffer));

          console.log(`   Video downloaded to: ${videoPath}`);
        } else {
          // Локальный путь
          videoPath = path.join(process.cwd(), "public", video.videoUrl);
        }

        // Используем настройки пользователя по умолчанию, если не указаны
        const finalPrivacyStatus = video.privacyStatus || user.youtubeSettings?.defaultPrivacyStatus || "public";
        const finalTags = video.tags || user.youtubeSettings?.defaultTags || ["shorts", "comedy", "funny"];

        // Загружаем видео на YouTube
        console.log("   Uploading to YouTube...");
        const result = await uploadVideoToYouTube({
          oauth2Client,
          videoPath,
          title: video.title,
          description: video.description || `${video.title}\n\nGenerated with AI`,
          tags: finalTags,
          privacyStatus: finalPrivacyStatus,
        });

        console.log(`   ✅ Video uploaded: ${result.videoUrl}`);

        // Обновляем статус на "published"
        await updateScheduledVideoStatus(userId, video.id, "published", {
          publishedAt: new Date(),
          youtubeVideoId: result.videoId,
          youtubeVideoUrl: result.videoUrl,
        });

        // Удаляем временный файл, если был скачан
        if (video.videoUrl.startsWith("http://") || video.videoUrl.startsWith("https://")) {
          try {
            await fs.unlink(videoPath);
            console.log("   Temporary file deleted");
          } catch (error) {
            console.error("   Failed to delete temporary file:", error);
          }
        }

        // Обновляем статус анекдота, если это анекдот
        if (video.jokeId && !video.jokeId.startsWith("constructor-")) {
          try {
            await markJokeCandidateAsPublished({
              id: video.jokeId,
              youtubeVideoUrl: result.videoUrl,
              youtubeVideoId: result.videoId,
            });
            console.log(`   ✅ Joke ${video.jokeId} marked as published`);
          } catch (error) {
            console.error(`   ⚠️ Failed to update joke status:`, error);
          }
        }

        results.success++;
      } catch (error: any) {
        console.error(`   ❌ Failed to publish video ${video.id}:`, error);

        // Обновляем статус на "failed"
        await updateScheduledVideoStatus(userId, video.id, "failed", {
          errorMessage: error.message || "Unknown error",
        });

        results.failed++;
        results.errors.push({
          videoId: video.id,
          error: error.message || "Unknown error",
        });
      }
    }

    console.log("\n✅ Cron job completed");
    console.log(`   Success: ${results.success}`);
    console.log(`   Failed: ${results.failed}`);

    return NextResponse.json({
      success: true,
      results,
      message: `Published ${results.success} videos, ${results.failed} failed`,
    });
  } catch (error: any) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        error: "Failed to run cron job",
        details: error.message
      },
      { status: 500 }
    );
  }
}
