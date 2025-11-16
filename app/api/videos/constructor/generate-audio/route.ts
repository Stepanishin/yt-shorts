import { NextRequest, NextResponse } from "next/server";
import { generateAudio } from "@/lib/video/audio-generator";

/**
 * POST /api/videos/constructor/generate-audio
 * Генерирует аудио через AI (Udio)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, lyricsType = "instrumental" } = body;

    console.log("Generating audio for constructor:", { text, lyricsType });

    // Генерируем аудио
    const result = await generateAudio({
      jokeText: text || "Upbeat cheerful background music",
      taskType: "generate_music",
      lyricsType: lyricsType as "generate" | "user" | "instrumental",
    });

    console.log("Audio generated:", result.audioUrl);

    return NextResponse.json({
      success: true,
      audioUrl: result.audioUrl,
      generationId: result.generationId,
      duration: result.duration,
    });
  } catch (error) {
    console.error("Error generating audio:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate audio",
      },
      { status: 500 }
    );
  }
}
