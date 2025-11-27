import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deductCredits } from "@/lib/db/users";
import { generateBackground } from "@/lib/video/background-generator";

// Стоимость в зависимости от модели
const BACKGROUND_MODEL_COSTS: Record<string, number> = {
  "ray-v1": 35, // 35 кредитов ($0.35) за генерацию фона через Luma Dream Machine (PiAPI)
  "hailuo-t2v-01": 35, // 35 кредитов ($0.35) за генерацию фона через Hailuo
  "luma-direct": 25, // 25 кредитов ($0.25) за генерацию через прямой Luma API (Ray Flash 2: 540p·5sec, себестоимость $0.14)
};

/**
 * POST /api/videos/constructor/generate-background
 * Генерирует видео-фон через AI (Luma Dream Machine)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      console.error("❌ No user session found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("✅ User authenticated:", { userId: session.user.id, email: session.user.email });

    const body = await request.json();
    const { text, style = "nature", modelName = "ray-v1" as "ray-v1" | "hailuo-t2v-01" | "luma-direct", useCustomPrompt = false } = body;

    console.log("📝 Request params:", { text, style, modelName, useCustomPrompt, textLength: text?.length });

    // Определяем стоимость на основе модели
    const cost = BACKGROUND_MODEL_COSTS[modelName] || BACKGROUND_MODEL_COSTS["ray-v1"];
    console.log("💰 Cost for this model:", cost, "credits");

    // Проверяем текущий баланс пользователя (используем getUserByGoogleId, т.к. session.user.id это Google ID)
    const { getUserByGoogleId } = await import("@/lib/db/users");
    const user = await getUserByGoogleId(session.user.id);
    console.log("👤 User balance before deduction:", {
      googleId: session.user.id,
      mongoId: user?._id?.toString(),
      credits: user?.credits,
      hasCreditsField: user?.hasOwnProperty('credits')
    });

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

    // Генерируем фон
    const result = await generateBackground({
      jokeText: text || "Beautiful background video",
      style: style as "nature" | "abstract" | "minimalist",
      modelName: modelName as "ray-v1" | "hailuo-t2v-01" | "luma-direct",
      useCustomPrompt, // Передаем флаг для использования пользовательского промпта
    });

    console.log("✅ Background generated successfully:", result.videoUrl);

    // Списываем кредиты ТОЛЬКО после успешной генерации
    try {
      await deductCredits(user._id.toString(), cost);
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
