import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateNewsVideo } from "@/lib/auto-generation/news-generator";
import { getNewsAutoGenerationConfig, getNewsAutoGenerationConfigById } from "@/lib/db/auto-generation-news";

/**
 * POST /api/auto-generation-news/generate-now
 * Manually trigger news video generation for testing
 * Accepts optional configId in body for multi-channel support
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = user._id!.toString();

    // Support configId in body for multi-channel
    let body: any = {};
    try { body = await request.json(); } catch {}
    const requestedConfigId = body.configId;

    // Get config (by configId if provided, otherwise first for user)
    const config = requestedConfigId
      ? await getNewsAutoGenerationConfigById(requestedConfigId)
      : await getNewsAutoGenerationConfig(userId);

    if (!config) {
      return NextResponse.json(
        { error: "News auto-generation config not found. Please configure it first." },
        { status: 404 }
      );
    }

    if (!config.isEnabled) {
      return NextResponse.json(
        { error: "News auto-generation is disabled. Please enable it first." },
        { status: 400 }
      );
    }

    // Schedule for immediate publication (1 minute from now)
    const scheduledAt = new Date(Date.now() + 60 * 1000);

    console.log(`Manually triggering news video generation for user ${userId}, config ${config._id}`);

    // Generate video
    const job = await generateNewsVideo(
      userId,
      config._id!.toString(),
      scheduledAt
    );

    return NextResponse.json({
      success: true,
      job: {
        id: job._id,
        status: job.status,
        newsId: job.newsId,
        newsTitle: job.newsTitle,
        scheduledAt,
      },
    });
  } catch (error) {
    console.error("Error generating news video:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
