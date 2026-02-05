import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getMemeAutoGenerationConfig,
  saveMemeAutoGenerationConfig,
  deleteMemeAutoGenerationConfig,
} from "@/lib/db/auto-generation-meme";
import { getUserByGoogleId } from "@/lib/db/users";
import { ObjectId } from "mongodb";

/**
 * GET /api/auto-generation-memes/config
 * Get meme auto-generation configuration for the current user
 */
export async function GET() {
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

    const config = await getMemeAutoGenerationConfig(user._id!.toString());

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("[API] Error getting meme config:", error);
    return NextResponse.json(
      { error: "Failed to get configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auto-generation-memes/config
 * Create or update meme auto-generation configuration
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

    const body = await request.json();

    // Prepare config object
    const configData = {
      _id: body._id ? new ObjectId(body._id) : undefined,
      userId: user._id!.toString(),
      isEnabled: body.isEnabled ?? false,
      videosPerDay: body.videosPerDay ?? 3,
      publishTimes: body.publishTimes ?? [],
      template: {
        imageEffect: body.template?.imageEffect ?? "zoom-in-out",
        duration: body.template?.duration ?? 10,
        audio: body.template?.audio ?? {
          urls: [],
          randomTrim: true,
        },
        gif: body.template?.gif,
      },
      youtube: {
        privacyStatus: body.youtube?.privacyStatus ?? "public",
        tags: body.youtube?.tags ?? ["meme", "memes", "humor", "viral", "shorts"],
        useAI: body.youtube?.useAI ?? true,
        channelId: body.youtube?.channelId,
        manualChannelId: body.youtube?.manualChannelId,
        savedChannelId: body.youtube?.savedChannelId,
      },
      stats: body.stats ?? {
        totalGenerated: 0,
        totalPublished: 0,
      },
    };

    const savedConfig = await saveMemeAutoGenerationConfig(configData);

    return NextResponse.json({
      success: true,
      config: savedConfig,
    });
  } catch (error) {
    console.error("[API] Error saving meme config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auto-generation-memes/config
 * Delete meme auto-generation configuration
 */
export async function DELETE() {
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

    const deleted = await deleteMemeAutoGenerationConfig(user._id!.toString());

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (error) {
    console.error("[API] Error deleting meme config:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}
