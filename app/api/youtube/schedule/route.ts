import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addScheduledVideo, getScheduledVideos } from "@/lib/db/users";

/**
 * POST /api/youtube/schedule
 * Планирует видео для публикации на YouTube в заданное время
 *
 * Body: {
 *   videoUrl: string, // URL видео из S3 или локальный путь
 *   title: string,
 *   description?: string,
 *   tags?: string[],
 *   privacyStatus?: "private" | "public" | "unlisted",
 *   scheduledAt: string, // ISO 8601 date string
 *   jokeId?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { videoUrl, title, description, tags, privacyStatus, scheduledAt, jokeId } = body;

    if (!videoUrl || !title || !scheduledAt) {
      return NextResponse.json(
        { error: "videoUrl, title, and scheduledAt are required" },
        { status: 400 }
      );
    }

    // Проверяем, что scheduledAt - это будущее время
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: "scheduledAt must be in the future" },
        { status: 400 }
      );
    }

    console.log(`Scheduling video for user ${session.user.id}: ${title} at ${scheduledAt}`);

    const scheduledVideo = await addScheduledVideo(session.user.id, {
      videoUrl,
      title,
      description,
      tags,
      privacyStatus,
      scheduledAt: scheduledDate,
      jokeId,
    });

    return NextResponse.json({
      success: true,
      scheduledVideo,
      message: `Video scheduled for ${scheduledDate.toLocaleString()}`,
    });
  } catch (error: any) {
    console.error("Schedule video error:", error);
    return NextResponse.json(
      {
        error: "Failed to schedule video",
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/youtube/schedule
 * Получает список запланированных видео для текущего пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const scheduledVideos = await getScheduledVideos(session.user.id);

    return NextResponse.json({
      success: true,
      scheduledVideos,
    });
  } catch (error: any) {
    console.error("Get scheduled videos error:", error);
    return NextResponse.json(
      {
        error: "Failed to get scheduled videos",
        details: error.message
      },
      { status: 500 }
    );
  }
}
