import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/youtube/check-auth
 * Проверяет наличие YouTube токенов авторизации
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("youtube_access_token")?.value;
    const refreshToken = cookieStore.get("youtube_refresh_token")?.value;

    const authorized = !!(accessToken || refreshToken);

    return NextResponse.json({
      authorized,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
    });
  } catch (error) {
    console.error("Failed to check YouTube auth:", error);
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
}
