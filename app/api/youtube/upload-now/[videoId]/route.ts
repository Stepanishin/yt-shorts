import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId, updateScheduledVideoStatus } from "@/lib/db/users";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { uploadVideoToYouTube, createOAuth2Client, setEncryptedCredentials, refreshAccessToken } from "@/lib/youtube/youtube-client";
import { getYouTubeChannelByChannelId, updateYouTubeChannelTokens } from "@/lib/db/youtube-channels";
import { encrypt } from "@/lib/encryption";
import { markJokeCandidateAsPublished } from "@/lib/ingest/storage";
import { markJokeCandidateAsPublishedDE } from "@/lib/ingest-de/storage";
import { markJokeCandidateAsPublishedPT } from "@/lib/ingest-pt/storage";
import { markJokeCandidateAsPublishedFR } from "@/lib/ingest-fr/storage";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * POST /api/youtube/upload-now/[videoId]
 * Upload a scheduled video to YouTube immediately
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the scheduled video
    const db = await getMongoDatabase();
    const userWithVideo = await db.collection("users").findOne({
      googleId: user.googleId,
      "scheduledVideos.id": videoId,
    });

    if (!userWithVideo) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const video = userWithVideo.scheduledVideos.find((v: any) => v.id === videoId);

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.status !== "planned") {
      return NextResponse.json(
        { error: `Cannot upload video with status: ${video.status}` },
        { status: 400 }
      );
    }

    if (!user.youtubeSettings?.accessToken) {
      return NextResponse.json(
        { error: "YouTube not authorized for this user" },
        { status: 400 }
      );
    }

    // Update status to "publishing"
    await updateScheduledVideoStatus(user._id!.toString(), video.id, "publishing");

    // Get OAuth client - try to use channel-specific credentials if available
    let oauth2Client;

    if (video.youtubeChannelId) {
      const channelCreds = await getYouTubeChannelByChannelId(user.googleId, video.youtubeChannelId);

      if (channelCreds && channelCreds.accessToken) {
        console.log(`📺 Using channel-specific credentials for ${channelCreds.channelTitle}`);

        const tempClient = createOAuth2Client({
          clientId: channelCreds.clientId,
          clientSecret: channelCreds.clientSecret,
          redirectUri: process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`,
          youtubeProject: channelCreds.youtubeProject,
        } as any);

        setEncryptedCredentials(
          tempClient,
          channelCreds.accessToken,
          channelCreds.refreshToken
        );

        // Check if token needs refresh
        const now = new Date();
        const expiresAt = channelCreds.tokenExpiresAt ? new Date(channelCreds.tokenExpiresAt) : now;
        const needsRefresh = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

        if (needsRefresh && channelCreds.refreshToken) {
          console.log(`🔄 Channel token expired, refreshing...`);

          try {
            const newCredentials = await refreshAccessToken(tempClient);
            const newExpiresAt = newCredentials.expiry_date
              ? new Date(newCredentials.expiry_date)
              : new Date(Date.now() + 3600 * 1000);

            await updateYouTubeChannelTokens(user.googleId, channelCreds.channelId, {
              accessToken: encrypt(newCredentials.access_token!),
              refreshToken: newCredentials.refresh_token ? encrypt(newCredentials.refresh_token) : channelCreds.refreshToken,
              tokenExpiresAt: newExpiresAt,
            });

            console.log(`✅ Channel token refreshed successfully`);
          } catch (error) {
            console.error(`❌ Failed to refresh channel token:`, error);
            throw new Error(`Failed to refresh YouTube access token. Please re-authorize in Settings.`);
          }
        }

        oauth2Client = tempClient;
      } else {
        console.log(`⚠️ Channel credentials not found, using default settings`);
        const result = await getUserYouTubeClient(user.googleId);
        oauth2Client = result.oauth2Client;
      }
    } else {
      const result = await getUserYouTubeClient(user.googleId);
      oauth2Client = result.oauth2Client;
    }

    // Download video if it's a remote URL
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

      const tempFileName = `upload_now_${video.id}_${Date.now()}.mp4`;
      videoPath = path.join(tempDir, tempFileName);

      const buffer = await response.arrayBuffer();
      await fs.writeFile(videoPath, Buffer.from(buffer));
    } else {
      videoPath = path.join(process.cwd(), "public", video.videoUrl);
    }

    const finalPrivacyStatus = video.privacyStatus || user.youtubeSettings?.defaultPrivacyStatus || "public";
    const finalTags = video.tags || user.youtubeSettings?.defaultTags || ["shorts", "comedy", "funny"];

    // Upload to YouTube
    const result = await uploadVideoToYouTube({
      oauth2Client,
      videoPath,
      title: video.title,
      description: video.description || `${video.title}\n\nGenerated with AI`,
      tags: finalTags,
      privacyStatus: finalPrivacyStatus,
      channelId: video.youtubeChannelId,
      language: video.language || "es",
    });

    console.log(`✅ Video uploaded: ${result.videoUrl}`);

    // Update status to "published"
    const publishedAt = new Date();
    await updateScheduledVideoStatus(user._id!.toString(), video.id, "published", {
      publishedAt,
      youtubeVideoId: result.videoId,
      youtubeVideoUrl: result.videoUrl,
    });

    // Delete temporary file
    if (video.videoUrl.startsWith("http://") || video.videoUrl.startsWith("https://")) {
      try {
        await fs.unlink(videoPath);
      } catch (error) {
        console.error("Failed to delete temporary file:", error);
      }
    }

    // Mark joke as published if applicable
    if (video.jokeId && !video.jokeId.startsWith("constructor-")) {
      try {
        if (video.language === "de") {
          await markJokeCandidateAsPublishedDE({
            id: video.jokeId,
            youtubeVideoUrl: result.videoUrl,
            youtubeVideoId: result.videoId,
          });
        } else if (video.language === "pt") {
          await markJokeCandidateAsPublishedPT({
            id: video.jokeId,
            youtubeVideoUrl: result.videoUrl,
            youtubeVideoId: result.videoId,
          });
        } else if (video.language === "fr") {
          await markJokeCandidateAsPublishedFR({
            id: video.jokeId,
            youtubeVideoUrl: result.videoUrl,
            youtubeVideoId: result.videoId,
          });
        } else {
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

    return NextResponse.json({
      success: true,
      youtubeVideoId: result.videoId,
      youtubeVideoUrl: result.videoUrl,
      publishedAt: publishedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Error uploading video:", error);

    // Try to update status to failed
    try {
      const session = await auth();
      if (session?.user?.id) {
        const user = await getUserByGoogleId(session.user.id);
        if (user) {
          await updateScheduledVideoStatus(
            user._id!.toString(),
            videoId,
            "failed",
            {
              errorMessage: error.message || "Unknown error",
            }
          );
        }
      }
    } catch (dbError) {
      console.error("Failed to update video status:", dbError);
    }

    return NextResponse.json(
      { error: error.message || "Failed to upload video" },
      { status: 500 }
    );
  }
}
