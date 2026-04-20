import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateNewsVideoSL } from "@/lib/auto-generation/news-generator-sl";
import { getNewsAutoGenerationConfigSL } from "@/lib/db/auto-generation-news-sl";

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

    const config = await getNewsAutoGenerationConfigSL(userId);

    if (!config) {
      return NextResponse.json(
        { error: "Slovenian news auto-generation config not found. Please configure it first." },
        { status: 404 }
      );
    }

    if (!config.isEnabled) {
      return NextResponse.json(
        { error: "Slovenian news auto-generation is disabled. Please enable it first." },
        { status: 400 }
      );
    }

    const scheduledAt = new Date(Date.now() + 60 * 1000);

    console.log(`Manually triggering Slovenian news video generation for user ${userId}`);

    const job = await generateNewsVideoSL(
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
    console.error("Error generating Slovenian news video:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
