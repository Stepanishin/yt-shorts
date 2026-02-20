import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateNewsVideo } from "@/lib/auto-generation/news-generator";
import { getNewsAutoGenerationConfig } from "@/lib/db/auto-generation-news";

/**
 * POST /api/auto-generation-news/generate-for-news
 * Generate video for a specific news item by ID
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

    const body = await request.json();
    const { newsId } = body;

    if (!newsId) {
      return NextResponse.json({ error: "newsId is required" }, { status: 400 });
    }

    // Get config
    const config = await getNewsAutoGenerationConfig(userId);

    if (!config) {
      return NextResponse.json(
        { error: "News auto-generation config not found. Please configure it first in the auto-generation settings." },
        { status: 404 }
      );
    }

    // Schedule for immediate publication (1 minute from now)
    const scheduledAt = new Date(Date.now() + 60 * 1000);

    console.log(`Generating news video for specific news ID ${newsId} for user ${userId}`);

    // Generate video for the specific news item
    const job = await generateNewsVideo(
      userId,
      config._id!.toString(),
      scheduledAt,
      newsId
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
    console.error("Error generating news video for specific news:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
