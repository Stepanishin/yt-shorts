import { NextRequest, NextResponse } from "next/server";
import { renderVideoNew, type RenderVideoNewOptions } from "@/lib/video/renderer-new";
import { randomBytes } from "crypto";

/**
 * POST /api/videos/constructor/render
 * Рендерит видео используя конструктор с кастомным расположением элементов
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      backgroundVideoUrl,
      backgroundImageUrl,
      imageEffect,
      textElements,
      emojiElements,
      audioUrl,
      duration = 10,
    } = body;

    // Валидация
    if (!backgroundVideoUrl && !backgroundImageUrl) {
      return NextResponse.json(
        { error: "Either backgroundVideoUrl or backgroundImageUrl is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(textElements)) {
      return NextResponse.json(
        { error: "textElements must be an array" },
        { status: 400 }
      );
    }

    if (!Array.isArray(emojiElements)) {
      return NextResponse.json(
        { error: "emojiElements must be an array" },
        { status: 400 }
      );
    }

    // Генерируем уникальный ID для задачи
    const jobId = randomBytes(16).toString("hex");

    console.log("Starting video render with constructor:", {
      jobId,
      backgroundVideoUrl,
      backgroundImageUrl,
      textElements: textElements.length,
      emojiElements: emojiElements.length,
      duration,
    });

    const options: RenderVideoNewOptions = {
      backgroundVideoUrl,
      backgroundImageUrl,
      imageEffect,
      textElements,
      emojiElements,
      audioUrl,
      duration,
      jobId,
    };

    // Рендерим видео
    const result = await renderVideoNew(options);

    console.log("Video render completed:", result);

    return NextResponse.json({
      success: true,
      video: result,
    });
  } catch (error) {
    console.error("Error rendering video:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to render video",
      },
      { status: 500 }
    );
  }
}
