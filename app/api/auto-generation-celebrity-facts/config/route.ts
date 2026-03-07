import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getCelebrityFactsAutoGenerationConfig,
  saveCelebrityFactsAutoGenerationConfig,
  CelebrityFactsAutoGenerationConfig,
} from "@/lib/db/auto-generation-celebrity-facts";
import { getUserByGoogleId } from "@/lib/db/users";

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserByGoogleId(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const config = await getCelebrityFactsAutoGenerationConfig(user._id!.toString());
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Error fetching celebrity facts config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserByGoogleId(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json();

    if (!body.template || !body.youtube || !body.publishTimes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const userId = user._id!.toString();
    const existingConfig = await getCelebrityFactsAutoGenerationConfig(userId);

    const configToSave: Omit<CelebrityFactsAutoGenerationConfig, "createdAt" | "updatedAt"> = {
      _id: existingConfig?._id,
      userId,
      isEnabled: body.isEnabled ?? false,
      videosPerDay: body.videosPerDay || 6,
      publishTimes: body.publishTimes || [],
      selectedTemplate: body.selectedTemplate || "template1",
      template: body.template,
      youtube: body.youtube,
      stats: existingConfig?.stats || { totalGenerated: 0, totalPublished: 0 },
    };

    const savedConfig = await saveCelebrityFactsAutoGenerationConfig(configToSave);
    return NextResponse.json({ success: true, config: savedConfig });
  } catch (error) {
    console.error("Error saving celebrity facts config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
