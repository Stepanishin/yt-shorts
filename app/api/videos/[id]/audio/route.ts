import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId, deductCredits } from "@/lib/db/users";
import { findVideoJobById, updateVideoJobStatus, VideoJobStatus } from "@/lib/video/storage";
import { generateAudio } from "@/lib/video/audio-generator";

// Стоимость генерации аудио
const AUDIO_COST = 3; // 3 кредита за аудио (Ace-Step 5 сек для старого редактора)

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
    // Проверяем аутентификацию
    const session = await auth();

    if (!session?.user?.id) {
      console.error("❌ No user session found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("✅ User authenticated:", { userId: session.user.id, email: session.user.email });

    // Получаем пользователя по Google ID
    const user = await getUserByGoogleId(session.user.id);
    console.log("👤 User found:", {
      googleId: session.user.id,
      mongoId: user?._id?.toString(),
      credits: user?.credits,
    });

    if (!user?._id) {
      console.error("❌ User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Проверяем баланс пользователя
    if ((user.credits || 0) < AUDIO_COST) {
      console.error("❌ Insufficient credits:", { current: user.credits, required: AUDIO_COST });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          requiredCredits: AUDIO_COST,
          currentCredits: user.credits || 0,
          message: `Недостаточно кредитов. Требуется: ${AUDIO_COST}, доступно: ${user.credits || 0}`,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log("✅ User has sufficient credits:", { current: user.credits, required: AUDIO_COST });

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const modelName = body.modelName || "ace-step"; // По умолчанию Ace-Step (дешевле)
    const taskType = modelName === "ace-step" ? "txt2audio" : (body.taskType || "generate_music");
    const lyricsType = body.lyricsType || "instrumental"; // По умолчанию инструментальная музыка
    const duration = body.duration || 5; // По умолчанию 5 секунд для shorts

    const job = await findVideoJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Video job not found" }, { status: 404 });
    }

    // Конвертируем job в формат для фоновой генерации
    const jobData = {
      _id: job._id.toString(),
      jokeText: job.jokeText,
      jokeTitle: job.jokeTitle,
      status: job.status,
    };

    // Запускаем генерацию аудио в фоне с userId для списания кредитов
    generateAudioInBackground(jobData, modelName, taskType, lyricsType, duration, user._id.toString()).catch((error) => {
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
 * Асинхронная функция для генерации музыки через AI (Ace-Step или Udio)
 */
async function generateAudioInBackground(
  job: { _id: string; jokeText: string; jokeTitle?: string; status: VideoJobStatus },
  modelName: "llm" | "ace-step",
  taskType: "txt2audio" | "generate_music" | "generate_music_custom",
  lyricsType: "generate" | "user" | "instrumental",
  duration: number,
  userId?: string
): Promise<void> {
  try {
    console.log("Starting AI music generation for job:", job._id);
    console.log("Model:", modelName, "Task type:", taskType, "Lyrics type:", lyricsType, "Duration:", duration);
    console.log("Joke text:", job.jokeText);
    console.log("Joke title:", job.jokeTitle);

    // Генерируем музыку через AI API
    const audioResult = await generateAudio({
      jokeText: job.jokeText,
      jokeTitle: job.jokeTitle,
      modelName,
      taskType,
      lyricsType,
      duration,
    });

    // Сохраняем URL аудио в job
    await updateVideoJobStatus({
      id: job._id,
      status: job.status,
      audioUrl: audioResult.audioUrl,
    });

    console.log(`${modelName === "ace-step" ? "Ace-Step" : "Udio"} music generated successfully:`, audioResult.audioUrl);
    console.log("⚠️  Музыка хранится на PiAPI сервере 3-7 дней");

    // Списываем кредиты ТОЛЬКО если userId передан и генерация успешна
    if (userId) {
      try {
        await deductCredits(
          userId,
          AUDIO_COST,
          "audio_generation",
          `Audio generation (llm, ${lyricsType})`,
          {
            modelName: "llm",
            lyricsType,
            generationId: audioResult.generationId,
            audioUrl: audioResult.audioUrl,
            jobId: job._id,
          }
        );
        console.log("✅ Credits deducted for audio generation:", AUDIO_COST);
      } catch (deductError) {
        console.error("⚠️ Failed to deduct credits for audio:", deductError);
        // Генерация прошла успешно, но не удалось списать кредиты
        // Продолжаем, логируем для расследования
      }
    }
  } catch (error) {
    console.error("Audio generation failed", error);
    throw error;
  }
}

