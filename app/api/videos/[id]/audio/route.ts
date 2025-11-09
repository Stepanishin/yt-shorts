import { NextResponse } from "next/server";
import { findVideoJobById, updateVideoJobStatus } from "@/lib/video/storage";
import { generateAudio } from "@/lib/video/audio-generator";

/**
 * API endpoint для генерации аудио для видео
 * POST /api/videos/[id]/audio
 *
 * Генерирует музыку через Udio API для существующего video job
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

    const body = await request.json().catch(() => ({}));
    const taskType = body.taskType || "generate_music"; // По умолчанию стандартная генерация Udio
    const lyricsType = body.lyricsType || "instrumental"; // По умолчанию инструментальная музыка

    const job = await findVideoJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Video job not found" }, { status: 404 });
    }

    // Запускаем генерацию аудио в фоне
    generateAudioInBackground(job, taskType, lyricsType).catch((error) => {
      console.error("Failed to generate audio in background", error);
      updateVideoJobStatus({
        id,
        status: job.status,
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(console.error);
    });

    return NextResponse.json({
      message: "Audio generation started",
      jobId: id,
    });
  } catch (error) {
    console.error("Failed to start audio generation", error);
    return NextResponse.json(
      { error: "Failed to start audio generation" },
      { status: 500 }
    );
  }
}

/**
 * Асинхронная функция для генерации музыки через Udio
 */
async function generateAudioInBackground(
  job: { _id: string; jokeText: string; jokeTitle?: string; status: string },
  taskType: "generate_music" | "generate_music_custom",
  lyricsType: "generate" | "user" | "instrumental"
): Promise<void> {
  try {
    console.log("Starting Udio music generation for job:", job._id);
    console.log("Joke text:", job.jokeText);
    console.log("Joke title:", job.jokeTitle);
    console.log("Task type:", taskType, "Lyrics type:", lyricsType);

    // Генерируем музыку через Udio API
    const audioResult = await generateAudio({
      jokeText: job.jokeText,
      jokeTitle: job.jokeTitle,
      taskType,
      lyricsType,
    });

    // Сохраняем URL аудио в job
    await updateVideoJobStatus({
      id: job._id,
      status: job.status,
      audioUrl: audioResult.audioUrl,
    });

    console.log("Udio music generated successfully:", audioResult.audioUrl);
    console.log("⚠️  Музыка хранится на PiAPI сервере 7 дней");
  } catch (error) {
    console.error("Audio generation failed", error);
    throw error;
  }
}

