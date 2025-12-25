import { getScheduledVideosForPublishing, updateScheduledVideoStatus } from "@/lib/db/users";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { uploadVideoToYouTube } from "@/lib/youtube/youtube-client";
import { markJokeCandidateAsPublished } from "@/lib/ingest/storage";
import { markJokeCandidateAsPublishedDE } from "@/lib/ingest-de/storage";
import { markJokeCandidateAsPublishedPT } from "@/lib/ingest-pt/storage";
import * as path from "path";
import * as fs from "fs/promises";

// Флаг для предотвращения одновременных запусков
let isPublishing = false;

/**
 * Автоматически публикует запланированные видео
 * Вызывается периодически из разных мест приложения
 */
export async function autoPublishScheduledVideos() {
  // Если уже идет публикация, пропускаем
  if (isPublishing) {
    return { skipped: true };
  }

  isPublishing = true;

  try {
    const videosToPublish = await getScheduledVideosForPublishing();

    if (videosToPublish.length === 0) {
      return { success: 0, failed: 0 };
    }

    console.log(`🕐 Auto-publishing ${videosToPublish.length} scheduled videos...`);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ videoId: string; error: string }>,
    };

    for (const { userId, video, user } of videosToPublish) {
      try {
        console.log(`📤 Publishing video ${video.id} for user ${userId}...`);

        if (!user || !user.youtubeSettings?.accessToken) {
          throw new Error("YouTube not authorized for this user");
        }

        // Обновляем статус на "publishing"
        await updateScheduledVideoStatus(userId, video.id, "publishing");

        // Используем googleId вместо _id для получения YouTube клиента
        const { oauth2Client } = await getUserYouTubeClient(user.googleId);

        // Определяем путь к видео
        let videoPath: string;

        if (video.videoUrl.startsWith("http://") || video.videoUrl.startsWith("https://")) {
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
        } else {
          videoPath = path.join(process.cwd(), "public", video.videoUrl);
        }

        const finalPrivacyStatus = video.privacyStatus || user.youtubeSettings?.defaultPrivacyStatus || "public";
        const finalTags = video.tags || user.youtubeSettings?.defaultTags || ["shorts", "comedy", "funny"];

        const result = await uploadVideoToYouTube({
          oauth2Client,
          videoPath,
          title: video.title,
          description: video.description || `${video.title}\n\nGenerated with AI`,
          tags: finalTags,
          privacyStatus: finalPrivacyStatus,
          channelId: video.youtubeChannelId, // Optional: use specific channel if specified
          language: video.language || "es", // Use video language or default to Spanish
        });

        console.log(`✅ Video uploaded: ${result.videoUrl}`);

        await updateScheduledVideoStatus(userId, video.id, "published", {
          publishedAt: new Date(),
          youtubeVideoId: result.videoId,
          youtubeVideoUrl: result.videoUrl,
        });

        // Удаляем временный файл
        if (video.videoUrl.startsWith("http://") || video.videoUrl.startsWith("https://")) {
          try {
            await fs.unlink(videoPath);
          } catch (error) {
            console.error("Failed to delete temporary file:", error);
          }
        }

        // Обновляем статус анекдота (для ES, DE или PT шуток)
        if (video.jokeId && !video.jokeId.startsWith("constructor-")) {
          try {
            // Используем правильную функцию в зависимости от языка
            if (video.language === "de") {
              console.log(`[DE] Marking joke ${video.jokeId} as published...`);
              await markJokeCandidateAsPublishedDE({
                id: video.jokeId,
                youtubeVideoUrl: result.videoUrl,
                youtubeVideoId: result.videoId,
              });
            } else if (video.language === "pt") {
              console.log(`[PT] Marking joke ${video.jokeId} as published...`);
              await markJokeCandidateAsPublishedPT({
                id: video.jokeId,
                youtubeVideoUrl: result.videoUrl,
                youtubeVideoId: result.videoId,
              });
            } else {
              // По умолчанию используем ES (испанский)
              await markJokeCandidateAsPublished({
                id: video.jokeId,
                youtubeVideoUrl: result.videoUrl,
                youtubeVideoId: result.videoId,
              });
            }
          } catch (error) {
            console.error("Failed to update joke status:", error);
          }
        }

        results.success++;
      } catch (error: any) {
        console.error(`❌ Failed to publish video ${video.id}:`, error);

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

    console.log(`✅ Auto-publish completed: ${results.success} success, ${results.failed} failed`);
    return results;
  } catch (error) {
    console.error("Auto-publish error:", error);
    return { success: 0, failed: 0, error: error instanceof Error ? error.message : "Unknown error" };
  } finally {
    isPublishing = false;
  }
}
