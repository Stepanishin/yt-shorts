import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getTokensFromCode } from "@/lib/youtube/youtube-client";
import { auth } from "@/lib/auth";
import { getUserByGoogleId, updateUser, type YouTubeSettings } from "@/lib/db/users";
import { encrypt } from "@/lib/encryption";

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
    });

    // Calculate token expiry date
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default: 1 hour from now

    // Update user's YouTube settings with encrypted tokens
    // Если используются глобальные credentials, сохраняем их в настройки пользователя для будущего использования
    const globalClientId = process.env.YOUTUBE_CLIENT_ID || "";
    const globalClientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
    const globalRedirectUri = process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`;

    // Убеждаемся, что у нас есть credentials (либо пользовательские, либо глобальные)
    if (!userSettings && (!globalClientId || !globalClientSecret)) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?youtube_error=credentials_not_found", request.url)
      );
    }

    const updatedSettings: YouTubeSettings = {
      // Используем пользовательские credentials, если они есть, иначе глобальные
      clientId: userSettings?.clientId || globalClientId,
      clientSecret: userSettings?.clientSecret || encrypt(globalClientSecret),
      redirectUri: userSettings?.redirectUri || globalRedirectUri,
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
