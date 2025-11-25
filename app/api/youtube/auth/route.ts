import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getAuthUrl } from "@/lib/youtube/youtube-client";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/youtube/auth
 * Инициирует OAuth процесс для YouTube
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      console.error("User not found:", session.user.id);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log("User found:", {
      email: user.email,
      hasYoutubeSettings: !!user.youtubeSettings,
      hasClientId: !!user.youtubeSettings?.clientId,
      hasClientSecret: !!user.youtubeSettings?.clientSecret,
      hasGlobalCredentials: !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    });

    // Используем пользовательские credentials, если они есть, иначе fallback на глобальные из env
    const userSettings = (user.youtubeSettings?.clientId && user.youtubeSettings?.clientSecret)
      ? user.youtubeSettings
      : undefined;

    // Если нет ни пользовательских, ни глобальных credentials - возвращаем ошибку
    if (!userSettings && (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET)) {
      console.error("YouTube credentials missing:", {
        hasUserSettings: !!userSettings,
        hasGlobalCredentials: !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
      });
      return NextResponse.json(
        { error: "YouTube OAuth credentials not configured. Please configure them in Settings or contact administrator." },
        { status: 400 }
      );
    }

    const oauth2Client = createOAuth2Client(userSettings);
    const authUrl = getAuthUrl(oauth2Client);

    // Редирект на страницу авторизации Google
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("YouTube auth error:", error);
    return NextResponse.json(
      { error: "Failed to initiate YouTube authorization" },
      { status: 500 }
    );
  }
}
