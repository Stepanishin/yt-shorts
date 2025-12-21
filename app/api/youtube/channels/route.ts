import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { getUserYouTubeClient } from "@/lib/youtube/user-youtube-client";
import { getUserYouTubeChannels } from "@/lib/youtube/youtube-client";

/**
 * GET /api/youtube/channels
 * Получает список YouTube каналов текущего пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.youtubeSettings?.accessToken) {
      return NextResponse.json(
        { error: "YouTube not connected. Please authorize YouTube first." },
        { status: 400 }
      );
    }

    // Get YouTube OAuth client
    const { oauth2Client } = await getUserYouTubeClient(user.googleId);

    // Fetch user's YouTube channels
    const channels = await getUserYouTubeChannels(oauth2Client);

    return NextResponse.json({
      success: true,
      channels,
    });
  } catch (error: any) {
    console.error("Error fetching YouTube channels:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch YouTube channels",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
