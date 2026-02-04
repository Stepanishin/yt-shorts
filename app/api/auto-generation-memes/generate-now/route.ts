import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMemeAutoGenerationConfig } from "@/lib/db/auto-generation-meme";
import { generateAutoVideoMeme } from "@/lib/auto-generation/generator-meme";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * POST /api/auto-generation-memes/generate-now
 * Manually trigger meme video generation
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await getUserByGoogleId(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = user._id!.toString();

    // Get user config
    const config = await getMemeAutoGenerationConfig(userId);

    if (!config) {
      return NextResponse.json(
        { error: "No meme auto-generation configuration found. Please create one first." },
        { status: 400 }
      );
    }

    // Parse scheduled time from request body or use now + 5 minutes
    const body = await request.json().catch(() => ({}));
    const scheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt)
      : new Date(Date.now() + 5 * 60 * 1000); // Default: 5 minutes from now

    console.log(`[API] Manual meme generation triggered by user ${userId}`);
    console.log(`[API] Scheduled for: ${scheduledAt.toISOString()}`);

    // Generate video
    const job = await generateAutoVideoMeme(
      userId,
      config._id!.toString(),
      scheduledAt
    );

    return NextResponse.json({
      success: true,
      job: {
        id: job._id?.toString(),
        status: job.status,
        memeTitle: job.memeTitle,
        scheduledAt: job.results?.scheduledAt,
        videoUrl: job.results?.renderedVideoUrl,
      },
    });
  } catch (error) {
    console.error("[API] Error generating meme video:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate video",
      },
      { status: 500 }
    );
  }
}
