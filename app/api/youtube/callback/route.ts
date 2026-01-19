import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getTokensFromCode, getUserYouTubeChannels } from "@/lib/youtube/youtube-client";
import { auth } from "@/lib/auth";
import { getUserByGoogleId, updateUser, type YouTubeSettings } from "@/lib/db/users";
import { encrypt } from "@/lib/encryption";
import { upsertYouTubeChannel } from "@/lib/db/youtube-channels";

/**
 * GET /api/youtube/callback
 * Обрабатывает callback от Google OAuth
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(
        new URL("/?youtube_error=unauthorized", request.url)
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const stateParam = searchParams.get("state");

    // Parse state to check if this is adding a new channel
    let addChannel = false;
    if (stateParam) {
      try {
        const state = JSON.parse(stateParam);
        addChannel = state.addChannel === true;
      } catch (e) {
        console.warn("Failed to parse OAuth state:", e);
      }
    }

    if (error) {
      console.error("YouTube OAuth error:", error);
      return NextResponse.redirect(
        new URL(`/dashboard/settings?youtube_error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code not found" },
        { status: 400 }
      );
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?youtube_error=user_not_found", request.url)
      );
    }

    // Используем те же credentials, что использовались в auth
    // Если у пользователя есть свои credentials - используем их, иначе глобальные
    const userSettings = (user.youtubeSettings?.clientId && user.youtubeSettings?.clientSecret)
      ? user.youtubeSettings
      : undefined;

    // Проверяем наличие credentials (пользовательских или глобальных)
    if (!userSettings && (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET)) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?youtube_error=credentials_not_found", request.url)
      );
    }

    const oauth2Client = createOAuth2Client(userSettings);
    const tokens = await getTokensFromCode(oauth2Client, code);

    console.log("YouTube tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      usingGlobalCredentials: !userSettings,
      addChannel,
    });

    // Calculate token expiry date
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default: 1 hour from now

    const globalClientId = process.env.YOUTUBE_CLIENT_ID || "";
    const globalClientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";

    // Убеждаемся, что у нас есть credentials (либо пользовательские, либо глобальные)
    if (!userSettings && (!globalClientId || !globalClientSecret)) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?youtube_error=credentials_not_found", request.url)
      );
    }

    // If adding a new channel, save to youtube_channels collection
    if (addChannel) {
      try {
        // Set credentials to get channel info
        oauth2Client.setCredentials(tokens);

        // Get channel information from YouTube API
        const channels = await getUserYouTubeChannels(oauth2Client);
        if (channels.length === 0) {
          throw new Error("No YouTube channel found for this account");
        }

        // Get the first channel (should be the one that was just authorized)
        const channel = channels[0];

        console.log("Adding new YouTube channel:", {
          channelId: channel.id,
          channelTitle: channel.title,
        });

        // Save channel credentials to youtube_channels collection
        await upsertYouTubeChannel({
          userId: session.user.id,
          channelId: channel.id,
          channelTitle: channel.title,
          channelThumbnail: channel.thumbnailUrl,
          accessToken: encrypt(tokens.access_token!),
          refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          tokenExpiresAt: expiresAt,
          clientId: userSettings?.clientId || globalClientId,
          clientSecret: userSettings?.clientSecret || encrypt(globalClientSecret),
          youtubeProject: userSettings?.youtubeProject,
          isDefault: false, // New channels are not default by default
        });

        console.log("New channel saved to youtube_channels collection");

        // Redirect to settings page with success message
        return NextResponse.redirect(
          new URL("/dashboard/settings?youtube_channel_added=success", request.url)
        );
      } catch (error) {
        console.error("Error adding new YouTube channel:", error);
        return NextResponse.redirect(
          new URL("/dashboard/settings?youtube_error=channel_add_failed", request.url)
        );
      }
    }

    // Default behavior: Update user's YouTube settings (for backward compatibility)
    const updatedSettings: YouTubeSettings = {
      // Используем пользовательские credentials, если они есть, иначе глобальные
      clientId: userSettings?.clientId || globalClientId,
      clientSecret: userSettings?.clientSecret || encrypt(globalClientSecret),
      redirectUri: process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`, // Всегда из env
      accessToken: tokens.access_token ? encrypt(tokens.access_token) : user.youtubeSettings?.accessToken,
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : user.youtubeSettings?.refreshToken,
      tokenExpiresAt: expiresAt,
      // Сохраняем остальные настройки пользователя
      defaultPrivacyStatus: user.youtubeSettings?.defaultPrivacyStatus,
      defaultTags: user.youtubeSettings?.defaultTags,
      channelId: user.youtubeSettings?.channelId,
    };

    await updateUser(user._id!.toString(), { youtubeSettings: updatedSettings });

    console.log("Tokens saved to database for user:", session.user.id);

    // Redirect to settings page with success message
    return NextResponse.redirect(
      new URL("/dashboard/settings?youtube_auth=success", request.url)
    );
  } catch (error) {
    console.error("YouTube callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/settings?youtube_error=callback_failed", request.url)
    );
  }
}
