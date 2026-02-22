import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getNewsAutoGenerationConfig,
  saveNewsAutoGenerationConfig,
  deleteNewsAutoGenerationConfig,
  NewsAutoGenerationConfig,
} from "@/lib/db/auto-generation-news";
import { getUserByGoogleId } from "@/lib/db/users";

/**
 * GET /api/auto-generation-news/config
 * Get current news auto-generation configuration for the user
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

    const config = await getNewsAutoGenerationConfig(user._id!.toString());

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("Error fetching news auto-generation config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auto-generation-news/config
 * Create or update news auto-generation configuration
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

    const body = await request.json();

    // Validate required fields
    if (!body.template || !body.youtube || !body.publishTimes) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get existing config to preserve stats and _id
    const existingConfig = await getNewsAutoGenerationConfig(user._id!.toString());

    const configToSave: Omit<NewsAutoGenerationConfig, "createdAt" | "updatedAt"> = {
      _id: existingConfig?._id,
      userId: user._id!.toString(),
      isEnabled: body.isEnabled ?? false,
      videosPerDay: body.videosPerDay || 6,
      publishTimes: body.publishTimes || [],
      newsIngestSchedule: body.newsIngestSchedule,
      selectedTemplate: body.selectedTemplate || "template1",
      template: body.template,
      youtube: body.youtube,
      stats: existingConfig?.stats || {
        totalGenerated: 0,
        totalPublished: 0,
      },
    };

    const savedConfig = await saveNewsAutoGenerationConfig(configToSave);

    return NextResponse.json({
      success: true,
      config: savedConfig,
    });
  } catch (error) {
    console.error("Error saving news auto-generation config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auto-generation-news/config
 * Delete news auto-generation configuration
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByGoogleId(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const deleted = await deleteNewsAutoGenerationConfig(user._id!.toString());

    if (!deleted) {
      return NextResponse.json(
        { error: "Config not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Error deleting news auto-generation config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
