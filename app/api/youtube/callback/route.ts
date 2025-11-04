import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getTokensFromCode } from "@/lib/youtube/youtube-client";
import { cookies } from "next/headers";

/**
 * GET /api/youtube/callback
 * Обрабатывает callback от Google OAuth
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("YouTube OAuth error:", error);
      return NextResponse.redirect(
        new URL(`/?youtube_error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code not found" },
        { status: 400 }
      );
    }

    const oauth2Client = createOAuth2Client();
    const tokens = await getTokensFromCode(oauth2Client, code);

    // Сохраняем токены в cookies (в production лучше использовать database)
    const cookieStore = await cookies();
    cookieStore.set("youtube_access_token", tokens.access_token || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60, // 1 час
    });

    if (tokens.refresh_token) {
      cookieStore.set("youtube_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 дней
      });
    }

    // Редирект обратно на главную страницу с сообщением об успехе
    return NextResponse.redirect(
      new URL("/?youtube_auth=success", request.url)
    );
  } catch (error) {
    console.error("YouTube callback error:", error);
    return NextResponse.redirect(
      new URL("/?youtube_error=callback_failed", request.url)
    );
  }
}
