import { NextResponse } from "next/server";
import { findVideoJobById, updateVideoJobStatus } from "@/lib/video/storage";
import { renderFinalVideo } from "@/lib/video/renderer";

/**
 * API endpoint для запуска рендеринга финального видео
 * POST /api/videos/[id]/render
 * 
 * Рендерит финальное видео с текстом и эмодзи поверх видео-фона
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Получаем эмодзи из запроса, если передано
    const body = await request.json().catch(() => ({}));
    const emoji = body.emoji;

    const job = await findVideoJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Video job not found" }, { status: 404 });
    }

    if (!job.backgroundVideoUrl) {
      return NextResponse.json(
        { error: "Background video is not generated yet" },
        { status: 400 }
      );
    }

    // Проверяем, не идет ли уже рендеринг
    if (job.renderingStatus === "running") {
      return NextResponse.json(
        { error: "Rendering is already in progress" },
        { status: 400 }
      );
    }

    // Обновляем статус рендеринга на "running"
    await updateVideoJobStatus({
      id,
      status: job.status,
      renderingStatus: "running",
    });

    // Запускаем рендеринг в фоне (не ждем завершения)
    renderVideo(job, emoji).catch((error) => {
      console.error("Failed to render video in background", error);
      updateVideoJobStatus({
        id,
        status: job.status,
        renderingStatus: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(console.error);
    });

    return NextResponse.json({
      message: "Video rendering started",
      jobId: id,
    });
  } catch (error) {
    console.error("Failed to start video rendering", error);
    return NextResponse.json(
      { error: "Failed to start video rendering" },
      { status: 500 }
    );
  }
}

/**
 * Асинхронная функция для рендеринга видео
 */
async function renderVideo(job: any, emoji?: string): Promise<void> {
  try {
    console.log("Starting video rendering for job:", job._id);
    console.log("Background video:", job.backgroundVideoUrl);
    console.log("Text to render:", job.editedText || job.jokeText);
    
    // Используем переданную эмодзи или генерируем случайную
    let emojiToUse = emoji;
    if (!emojiToUse) {
      const laughingEmojis = ["😂", "🤣", "😆", "😄", "😃", "😊", "😁", "😀", "🤪", "😜", "🥳", "😋"];
      emojiToUse = laughingEmojis[Math.floor(Math.random() * laughingEmojis.length)];
    }
    console.log("Using emoji:", emojiToUse);
    
    // Рендерим финальное видео
    const result = await renderFinalVideo({
      backgroundVideoUrl: job.backgroundVideoUrl,
      jokeTitle: job.jokeTitle,
      editedText: job.editedText || job.jokeText,
      emoji: emojiToUse,
      jobId: String(job._id),
    });

    // Обновляем job с результатом
    await updateVideoJobStatus({
      id: job._id,
      status: job.status,
      renderingStatus: "completed",
      finalVideoUrl: result.videoUrl,
    });

    console.log("Video rendering completed:", result.videoUrl);
  } catch (error) {
    console.error("Video rendering failed", error);
    throw error;
  }
}

