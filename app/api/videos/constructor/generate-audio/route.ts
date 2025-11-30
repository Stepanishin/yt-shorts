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

    // Проверяем баланс пользователя БЕЗ списания (просто проверка достаточности средств)
    if ((user.credits || 0) < cost) {
      console.error("❌ Insufficient credits:", { current: user.credits, required: cost });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          requiredCredits: cost,
          currentCredits: user.credits || 0,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log("✅ User has sufficient credits:", { current: user.credits, required: cost });

    // Генерируем аудио
    const result = await generateAudio({
      jokeText: text || "Upbeat cheerful background music",
      taskType: "generate_music",
      lyricsType: lyricsType as "generate" | "user" | "instrumental",
      modelName: modelName as "llm",
    });

    console.log("✅ Audio generated successfully:", result.audioUrl);

    // Списываем кредиты ТОЛЬКО после успешной генерации
    try {
      await deductCredits(
        user._id.toString(),
        cost,
        "audio_generation",
        `Audio generation (${modelName}, ${lyricsType})`,
        {
          modelName,
          lyricsType,
          generationId: result.generationId,
        }
      );
      console.log("✅ Credits deducted after successful generation");

      // Проверяем баланс после списания
      const userAfter = await getUserByGoogleId(session.user.id);
      console.log("💰 User balance after deduction:", userAfter?.credits);
    } catch (deductError) {
      console.error("⚠️ Failed to deduct credits after generation:", deductError);
      // Генерация прошла успешно, но не удалось списать кредиты
      // Возвращаем результат, но логируем ошибку для расследования
    }

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
