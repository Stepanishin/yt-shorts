import { NextRequest, NextResponse } from "next/server";
import { generateBackground } from "@/lib/video/background-generator";

/**
 * POST /api/videos/constructor/generate-background
 * Генерирует видео-фон через AI (Luma Dream Machine)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, style = "nature" } = body;

    console.log("Generating background for constructor:", { text, style });

    // Генерируем фон
    const result = await generateBackground({
      jokeText: text || "Beautiful background video",
      style: style as "nature" | "abstract" | "minimalist",
    });

    console.log("Background generated:", result.videoUrl);

    return NextResponse.json({
      success: true,
      videoUrl: result.videoUrl,
      generationId: result.generationId,
    });
  } catch (error) {
    console.error("Error generating background:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate background",
      },
      { status: 500 }
    );
  }
}
