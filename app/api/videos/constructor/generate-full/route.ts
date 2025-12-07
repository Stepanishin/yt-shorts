import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deductCredits, getUserByGoogleId } from "@/lib/db/users";
import { generateBackground } from "@/lib/video/background-generator";
import { generateAudio } from "@/lib/video/audio-generator";
import { renderVideoNew, type RenderVideoNewOptions } from "@/lib/video/renderer-new";
import { randomBytes } from "crypto";

// Стоимость в зависимости от модели
const BACKGROUND_MODEL_COSTS: Record<string, number> = {
  "ray-v1": 35,
  "hailuo-t2v-01": 35,
  "luma-direct": 25,
};

const AUDIO_MODEL_COSTS: Record<string, number> = {
  "llm": 10,
  "ace-step": 3,
};

/**
 * POST /api/videos/constructor/generate-full
 * Полная генерация: фон + аудио + рендеринг (только для администраторов)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    // Проверка авторизации
    if (!session?.user?.id) {
      console.error("❌ No user session found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Получаем пользователя
    const user = await getUserByGoogleId(session.user.id);

    if (!user?._id) {
      console.error("❌ User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Проверка прав администратора
    if (!user.isAdmin) {
      console.error("❌ User is not an admin");
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    console.log("✅ Admin authenticated:", { userId: session.user.id, email: session.user.email });

    const body = await request.json();
    const {
      textElements,
      emojiElements,
      gifElements = [],
      duration = 5,
      backgroundModel = "luma-direct",
      audioModel = "ace-step", // По умолчанию Ace-Step (дешевле)
      backgroundPrompt = "",
      audioPrompt = "",
    } = body;

    // Валидация
    if (!Array.isArray(textElements) || !Array.isArray(emojiElements) || !Array.isArray(gifElements)) {
      return NextResponse.json(
        { error: "Invalid elements format" },
        { status: 400 }
      );
    }

    // Рассчитываем общую стоимость
    const backgroundCost = BACKGROUND_MODEL_COSTS[backgroundModel] || BACKGROUND_MODEL_COSTS["luma-direct"];
    const audioCost = AUDIO_MODEL_COSTS[audioModel] || AUDIO_MODEL_COSTS["llm"];
    const totalCost = backgroundCost + audioCost;

    console.log("💰 Total cost calculation:", {
      backgroundModel,
      backgroundCost,
      audioModel,
      audioCost,
      totalCost,
    });

    // Проверяем баланс пользователя
    if ((user.credits || 0) < totalCost) {
      console.error("❌ Insufficient credits:", { current: user.credits, required: totalCost });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          requiredCredits: totalCost,
          currentCredits: user.credits || 0,
        },
        { status: 402 }
      );
    }

    console.log("✅ User has sufficient credits:", { current: user.credits, required: totalCost });

    // Генерируем ID задачи
    const jobId = randomBytes(16).toString("hex");

    // Используем текстовый промпт для генерации
    const jokeText = textElements.map((el: { text: string }) => el.text).join(" ") || "Beautiful video";
    const hasCustomBackgroundPrompt = backgroundPrompt.trim().length > 0;
    const backgroundPromptText = hasCustomBackgroundPrompt ? backgroundPrompt.trim() : jokeText;
    const audioPromptText = audioPrompt.trim() || jokeText;

    // Шаг 1: Генерация фона
    console.log("🎬 Step 1: Generating background...");
    const backgroundResult = await generateBackground({
      jokeText: backgroundPromptText,
      style: "nature",
      modelName: backgroundModel as "ray-v1" | "hailuo-t2v-01" | "luma-direct",
      useCustomPrompt: hasCustomBackgroundPrompt,
    });
    console.log("✅ Background generated:", backgroundResult.videoUrl);

    // Шаг 2: Генерация аудио
    console.log("🎵 Step 2: Generating audio...");
    const audioResult = await generateAudio({
      jokeText: audioPromptText,
      taskType: audioModel === "ace-step" ? "txt2audio" : "generate_music",
      lyricsType: "instrumental",
      modelName: audioModel as "llm" | "ace-step",
      duration: 10, // 30 секунд для shorts
    });
    console.log("✅ Audio generated:", audioResult.audioUrl);

    // Шаг 3: Рендеринг видео
    console.log("🎥 Step 3: Rendering video...");
    const renderOptions: RenderVideoNewOptions = {
      backgroundVideoUrl: backgroundResult.videoUrl,
      textElements,
      emojiElements,
      gifElements,
      audioUrl: audioResult.audioUrl,
      duration,
      jobId,
    };

    const videoResult = await renderVideoNew(renderOptions);
    console.log("✅ Video rendered:", videoResult.videoUrl);

    // Списываем кредиты после успешной генерации
    try {
      // Списываем за фон
      await deductCredits(
        user._id.toString(),
        backgroundCost,
        "background_generation",
        `Full short generation - Background (${backgroundModel})`,
        {
          modelName: backgroundModel,
          generationId: backgroundResult.generationId,
          jobId,
        }
      );

      // Списываем за аудио
      await deductCredits(
        user._id.toString(),
        audioCost,
        "audio_generation",
        `Full short generation - Audio (${audioModel})`,
        {
          modelName: audioModel,
          generationId: audioResult.generationId,
          jobId,
        }
      );

      console.log("✅ Credits deducted successfully");

      // Проверяем баланс после списания
      const userAfter = await getUserByGoogleId(session.user.id);
      console.log("💰 User balance after deduction:", userAfter?.credits);
    } catch (deductError) {
      console.error("⚠️ Failed to deduct credits after generation:", deductError);
      // Генерация прошла успешно, но не удалось списать кредиты
      // Возвращаем результат, но логируем ошибку
    }

    return NextResponse.json({
      success: true,
      videoUrl: videoResult.videoUrl,
      backgroundUrl: backgroundResult.videoUrl,
      audioUrl: audioResult.audioUrl,
      jobId,
      creditsUsed: totalCost,
    });
  } catch (error) {
    console.error("Error in full generation:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate full short",
      },
      { status: 500 }
    );
  }
}
