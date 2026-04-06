import { getScheduledVideosForPublishing, updateScheduledVideoStatus } from "@/lib/db/users";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { uploadVideoToYouTube, createOAuth2Client, setEncryptedCredentials, refreshAccessToken, setVideoThumbnail } from "@/lib/youtube/youtube-client";
import { markJokeCandidateAsPublished } from "@/lib/ingest/storage";
import { markJokeCandidateAsPublishedDE } from "@/lib/ingest-de/storage";
import { markJokeCandidateAsPublishedPT } from "@/lib/ingest-pt/storage";
import { markJokeCandidateAsPublishedFR } from "@/lib/ingest-fr/storage";
import { getYouTubeChannelByChannelId, updateYouTubeChannelTokens } from "@/lib/db/youtube-channels";
import { encrypt } from "@/lib/encryption";
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

        // Get OAuth client - try to use channel-specific credentials if available
        let oauth2Client;

        if (video.youtubeChannelId) {
          // Try to find channel credentials in youtube_channels collection
          const channelCreds = await getYouTubeChannelByChannelId(user.googleId, video.youtubeChannelId);

          if (channelCreds && channelCreds.accessToken) {
            // Use channel-specific credentials
            console.log(`📺 Using channel-specific credentials for ${channelCreds.channelTitle} (${channelCreds.channelId})`);

            // Create OAuth client with channel credentials
            // Note: createOAuth2Client expects encrypted clientSecret and will decrypt it internally
            const tempClient = createOAuth2Client({
              clientId: channelCreds.clientId,
              clientSecret: channelCreds.clientSecret, // Already encrypted in DB, createOAuth2Client will decrypt
              redirectUri: process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`,
              youtubeProject: channelCreds.youtubeProject,
            } as any);

            // Set encrypted credentials
            setEncryptedCredentials(
              tempClient,
              channelCreds.accessToken,
              channelCreds.refreshToken
            );

            // Check if token needs refresh (expires in less than 5 minutes)
            const now = new Date();
            const expiresAt = channelCreds.tokenExpiresAt ? new Date(channelCreds.tokenExpiresAt) : now;
            const needsRefresh = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

            if (needsRefresh && channelCreds.refreshToken) {
              console.log(`🔄 Channel token expired or expiring soon, refreshing...`);

              try {
                const newCredentials = await refreshAccessToken(tempClient);

                // Calculate new expiry date
                const newExpiresAt = newCredentials.expiry_date
                  ? new Date(newCredentials.expiry_date)
                  : new Date(Date.now() + 3600 * 1000);

                // Update tokens in database
                await updateYouTubeChannelTokens(user.googleId, channelCreds.channelId, {
                  accessToken: encrypt(newCredentials.access_token!),
                  refreshToken: newCredentials.refresh_token ? encrypt(newCredentials.refresh_token) : channelCreds.refreshToken,
                  tokenExpiresAt: newExpiresAt,
                });

                console.log(`✅ Channel token refreshed successfully`);
              } catch (error) {
                console.error(`❌ Failed to refresh channel token:`, error);
                throw new Error(`Failed to refresh YouTube access token for channel ${channelCreds.channelTitle}. Please re-authorize in Settings.`);
              }
            }

            oauth2Client = tempClient;
          } else {
            // Fallback to user's default YouTube settings
            console.log(`⚠️ Channel credentials not found for ${video.youtubeChannelId}, using default settings`);
            const result = await getUserYouTubeClient(user.googleId);
            oauth2Client = result.oauth2Client;
          }
        } else {
          // No specific channel requested, use user's default YouTube settings
          const result = await getUserYouTubeClient(user.googleId);
          oauth2Client = result.oauth2Client;
        }

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

        // Set custom thumbnail if available (longform videos)
        if (video.thumbnailUrl && result.videoId) {
          try {
            let thumbPath: string;
            if (video.thumbnailUrl.startsWith("http")) {
              // Download thumbnail from Spaces
              const thumbResponse = await fetch(video.thumbnailUrl);
              if (thumbResponse.ok) {
                const tempDir = process.env.NODE_ENV === "production" ? "/tmp/videos" : path.join(process.cwd(), "public", "videos");
                thumbPath = path.join(tempDir, `thumb_${video.id}.jpg`);
                const thumbBuffer = await thumbResponse.arrayBuffer();
                await fs.writeFile(thumbPath, Buffer.from(thumbBuffer));
                await setVideoThumbnail(oauth2Client, result.videoId, thumbPath);
                try { await fs.unlink(thumbPath); } catch {}
              }
            } else if (video.thumbnailUrl.startsWith("/")) {
              // Local path
              thumbPath = video.thumbnailUrl;
              await setVideoThumbnail(oauth2Client, result.videoId, thumbPath);
            }
          } catch (thumbError) {
            console.warn("Failed to set thumbnail:", (thumbError as Error).message);
          }
        }

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
            } else if (video.language === "fr") {
              console.log(`[FR] Marking joke ${video.jokeId} as published...`);
              await markJokeCandidateAsPublishedFR({
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
