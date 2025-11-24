import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getTokensFromCode } from "@/lib/youtube/youtube-client";
import { auth } from "@/lib/auth";
import { getUserByGoogleId, updateUser } from "@/lib/db/users";
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
    if (!user || !user.youtubeSettings) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?youtube_error=settings_not_found", request.url)
      );
    }

    const oauth2Client = createOAuth2Client(user.youtubeSettings);
    const tokens = await getTokensFromCode(oauth2Client, code);

    console.log("YouTube tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    });

    // Calculate token expiry date
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default: 1 hour from now

    // Update user's YouTube settings with encrypted tokens
    const updatedSettings = {
      ...user.youtubeSettings,
      accessToken: tokens.access_token ? encrypt(tokens.access_token) : user.youtubeSettings.accessToken,
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : user.youtubeSettings.refreshToken,
      tokenExpiresAt: expiresAt,
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
