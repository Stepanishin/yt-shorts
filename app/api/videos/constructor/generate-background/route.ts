import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deductCredits } from "@/lib/db/users";
import { generateBackground } from "@/lib/video/background-generator";

// Стоимость в зависимости от модели
const BACKGROUND_MODEL_COSTS: Record<string, number> = {
  "ray-v1": 35, // 35 кредитов (€0.35) за генерацию фона
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
    const { text, style = "nature", modelName = "ray-v1" } = body;

    console.log("📝 Request params:", { text, style, modelName });

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

    // Проверяем и списываем кредиты перед генерацией (используем MongoDB _id)
    try {
      await deductCredits(user._id.toString(), cost);
      console.log("✅ Credits deducted successfully");

      // Проверяем баланс после списания
      const userAfter = await getUserByGoogleId(session.user.id);
      console.log("💰 User balance after deduction:", userAfter?.credits);
    } catch (error) {
      console.error("❌ Failed to deduct credits:", error);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Insufficient credits",
          requiredCredits: cost,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    try {
      // Генерируем фон
      const result = await generateBackground({
        jokeText: text || "Beautiful background video",
        style: style as "nature" | "abstract" | "minimalist",
        modelName: modelName as "ray-v1",
      });

      console.log("Background generated:", result.videoUrl);

      return NextResponse.json({
        success: true,
        videoUrl: result.videoUrl,
        generationId: result.generationId,
      });
    } catch (error) {
      // Если генерация не удалась, возвращаем кредиты
      console.error("Background generation failed, refunding credits:", error);
      try {
        const { addCredits } = await import("@/lib/db/users");
        await addCredits(user._id.toString(), cost);
        console.log("✅ Credits refunded");
      } catch (refundError) {
        console.error("Failed to refund credits:", refundError);
      }

      throw error;
    }
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
