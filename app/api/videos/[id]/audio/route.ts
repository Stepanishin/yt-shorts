import { NextResponse } from "next/server";
import { findVideoJobById, updateVideoJobStatus } from "@/lib/video/storage";
import { generateAudio } from "@/lib/video/audio-generator";

/**
 * API endpoint для генерации аудио для видео
 * POST /api/videos/[id]/audio
 * 
 * Генерирует аудио через DiffRhythm для существующего video job
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
    const taskType = body.taskType || "txt2audio-base"; // По умолчанию высокое качество

    const job = await findVideoJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Video job not found" }, { status: 404 });
    }

    // Запускаем генерацию аудио в фоне
    generateAudioInBackground(job, taskType).catch((error) => {
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
 * Асинхронная функция для генерации аудио
 */
async function generateAudioInBackground(
  job: any,
  taskType: "txt2audio-base" | "txt2audio-full"
): Promise<void> {
  try {
    console.log("Starting audio generation for job:", job._id);
    console.log("Joke text:", job.jokeText);
    console.log("Joke title:", job.jokeTitle);
    
    // Генерируем аудио через DiffRhythm
    const audioResult = await generateAudio({
      jokeText: job.jokeText,
      jokeTitle: job.jokeTitle,
      taskType,
    });

    // Сохраняем URL аудио в job
    await updateVideoJobStatus({
      id: job._id,
      status: job.status,
      audioUrl: audioResult.audioUrl,
    });

    console.log("Audio generated successfully:", audioResult.audioUrl);
  } catch (error) {
    console.error("Audio generation failed", error);
    throw error;
  }
}

