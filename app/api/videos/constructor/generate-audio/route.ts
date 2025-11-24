import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deductCredits } from "@/lib/db/users";
import { generateAudio } from "@/lib/video/audio-generator";

// Стоимость в зависимости от модели
const AUDIO_MODEL_COSTS: Record<string, number> = {
  "llm": 10, // 10 кредитов (€0.10) за генерацию аудио
};

/**
 * POST /api/videos/constructor/generate-audio
 * Генерирует аудио через AI (Udio)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { text, lyricsType = "instrumental", modelName = "llm" } = body;

    console.log("Generating audio for constructor:", { text, lyricsType, modelName });

    // Определяем стоимость на основе модели
    const cost = AUDIO_MODEL_COSTS[modelName] || AUDIO_MODEL_COSTS["llm"];

    // Получаем пользователя по Google ID для получения MongoDB _id
    const { getUserByGoogleId } = await import("@/lib/db/users");
    const user = await getUserByGoogleId(session.user.id);

    if (!user?._id) {
      console.error("❌ User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Проверяем и списываем кредиты перед генерацией (используем MongoDB _id)
    try {
      await deductCredits(user._id.toString(), cost);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Insufficient credits",
          requiredCredits: cost,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    try {
      // Генерируем аудио
      const result = await generateAudio({
        jokeText: text || "Upbeat cheerful background music",
        taskType: "generate_music",
        lyricsType: lyricsType as "generate" | "user" | "instrumental",
        modelName: modelName as "llm",
      });

      console.log("Audio generated:", result.audioUrl);

      return NextResponse.json({
        success: true,
        audioUrl: result.audioUrl,
        generationId: result.generationId,
        duration: result.duration,
      });
    } catch (error) {
      // Если генерация не удалась, возвращаем кредиты
      console.error("Audio generation failed, refunding credits:", error);
      try {
        const { addCredits } = await import("@/lib/db/users");
        await addCredits(user._id.toString(), cost);
      } catch (refundError) {
        console.error("Failed to refund credits:", refundError);
      }

      throw error;
    }
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
