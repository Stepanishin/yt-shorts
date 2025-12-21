import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAutoGenerationConfigDE } from "@/lib/db/auto-generation-de";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateAutoVideoDE } from "@/lib/auto-generation/generator";
import { calculateNextPublishTime } from "@/lib/auto-generation/schedule-calculator";

/**
 * POST /api/auto-generation-de/generate-now
 * Manually trigger video generation for testing (German videos)
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

    const config = await getAutoGenerationConfigDE(user._id!.toString());

    if (!config) {
      return NextResponse.json(
        { error: "Auto-generation for German videos not configured" },
        { status: 404 }
      );
    }

    if (!config.isEnabled) {
      return NextResponse.json(
        { error: "Auto-generation for German videos is disabled" },
        { status: 400 }
      );
    }

    // Calculate next publish time
    const scheduledAt = calculateNextPublishTime(config.publishTimes);

    console.log(`[DE] Manual generation triggered for user ${user._id}`);
    console.log(`[DE] Will schedule for: ${scheduledAt.toISOString()}`);

    // Generate video
    const job = await generateAutoVideoDE(
      user._id!.toString(),
      config._id!.toString(),
      scheduledAt
    );

    return NextResponse.json({
      success: true,
      message: "German video generated successfully",
      job: {
        id: job._id,
        status: job.status,
        scheduledAt: job.results?.scheduledAt,
        videoUrl: job.results?.renderedVideoUrl,
      },
    });
  } catch (error: any) {
    console.error("[DE] Error in manual generation:", error);
    return NextResponse.json(
      {
        error: "Failed to generate German video",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
