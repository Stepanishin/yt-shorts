import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/youtube/check-auth
 * Проверяет наличие YouTube токенов авторизации
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ authorized: false, hasAccessToken: false });
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ authorized: false, hasAccessToken: false });
    }

    const hasAccessToken = !!user.youtubeSettings?.accessToken;
    const hasRefreshToken = !!user.youtubeSettings?.refreshToken;

    return NextResponse.json({
      authorized: hasAccessToken || hasRefreshToken,
      hasAccessToken,
      hasRefreshToken,
    });
  } catch (error) {
    console.error("Failed to check YouTube auth:", error);
    return NextResponse.json({ authorized: false, hasAccessToken: false }, { status: 500 });
  }
}
