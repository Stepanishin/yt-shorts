import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getAuthUrl } from "@/lib/youtube/youtube-client";

/**
 * GET /api/youtube/auth
 * Инициирует OAuth процесс для YouTube
 */
export async function GET(request: NextRequest) {
  try {
    const oauth2Client = createOAuth2Client();
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
