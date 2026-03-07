import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { generateCelebrityFactsVideo } from "@/lib/auto-generation/celebrity-facts-generator";
import { getCelebrityFactsAutoGenerationConfig } from "@/lib/db/auto-generation-celebrity-facts";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserByGoogleId(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const userId = user._id!.toString();
    const config = await getCelebrityFactsAutoGenerationConfig(userId);

    if (!config) {
      return NextResponse.json(
        { error: "Celebrity facts auto-generation config not found. Please configure it first." },
        { status: 404 }
      );
    }

    if (!config.isEnabled) {
      return NextResponse.json(
        { error: "Celebrity facts auto-generation is disabled. Please enable it first." },
        { status: 400 }
      );
    }

    const scheduledAt = new Date(Date.now() + 60 * 1000);

    const job = await generateCelebrityFactsVideo(
      userId,
      config._id!.toString(),
      scheduledAt
    );

    return NextResponse.json({
      success: true,
      job: { id: job._id, status: job.status, factTitle: job.factTitle, scheduledAt },
    });
  } catch (error) {
    console.error("Error generating celebrity facts video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
