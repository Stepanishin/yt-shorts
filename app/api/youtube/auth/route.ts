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
      clientId: user.youtubeSettings?.clientId?.substring(0, 20) + "...",
    });

    if (!user.youtubeSettings?.clientId || !user.youtubeSettings?.clientSecret) {
      console.error("YouTube settings missing:", {
        hasSettings: !!user.youtubeSettings,
        hasClientId: !!user.youtubeSettings?.clientId,
        hasClientSecret: !!user.youtubeSettings?.clientSecret,
      });
      return NextResponse.json(
        { error: "YouTube OAuth credentials not configured. Please configure them in Settings." },
        { status: 400 }
      );
    }

    const oauth2Client = createOAuth2Client(user.youtubeSettings);
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
