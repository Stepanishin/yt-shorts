import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getNewsAutoGenerationConfigSL,
  saveNewsAutoGenerationConfigSL,
  deleteNewsAutoGenerationConfigSL,
  NewsAutoGenerationConfigSL,
} from "@/lib/db/auto-generation-news-sl";
import { getUserByGoogleId } from "@/lib/db/users";

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

    const config = await getNewsAutoGenerationConfigSL(user._id!.toString());

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("Error fetching Slovenian news auto-generation config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    if (!body.template || !body.youtube || !body.publishTimes) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existingConfig = await getNewsAutoGenerationConfigSL(user._id!.toString());

    const configToSave: Omit<NewsAutoGenerationConfigSL, "createdAt" | "updatedAt"> = {
      _id: existingConfig?._id,
      userId: user._id!.toString(),
      isEnabled: body.isEnabled ?? false,
      videosPerDay: body.videosPerDay || 6,
      publishTimes: body.publishTimes || [],
      blackAndWhitePhoto: body.blackAndWhitePhoto ?? false,
      template: body.template,
      youtube: body.youtube,
      stats: existingConfig?.stats || {
        totalGenerated: 0,
        totalPublished: 0,
      },
    };

    const savedConfig = await saveNewsAutoGenerationConfigSL(configToSave);

    return NextResponse.json({
      success: true,
      config: savedConfig,
    });
  } catch (error) {
    console.error("Error saving Slovenian news auto-generation config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const deleted = await deleteNewsAutoGenerationConfigSL(user._id!.toString());

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
    console.error("Error deleting Slovenian news auto-generation config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
