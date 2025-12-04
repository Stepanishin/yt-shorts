import { findVideoJobById, updateVideoJobStatus } from "./storage";
import { generateBackground } from "./background-generator";
import { generateAudio } from "./audio-generator";
import { deductCredits } from "@/lib/db/users";

// Стоимость генерации
const BACKGROUND_COST = 25; // 25 кредитов за luma-direct
const AUDIO_COST = 3; // 3 кредита за аудио (Ace-Step 5 сек)

/**
 * Обрабатывает видео джобу
 * 1. Генерирует видео фон через Luma
 * 2. Генерирует аудио через Udio
 * 3. Списывает кредиты с пользователя
 */
export async function processVideoJob(jobId: unknown, userId?: string): Promise<void> {
  try {
    // Получаем джобу для доступа к данным анекдота
    const job = await findVideoJobById(jobId);
    if (!job) {
      throw new Error("Video job not found");
    }

    // Обновляем статус на "running"
    await updateVideoJobStatus({
      id: jobId,
      status: "running",
    });

    // 1. Генерируем видео фон через Luma
    console.log("Generating background video for video job:", jobId);

    // Используем только природный стиль с разными вариантами
    const backgroundResult = await generateBackground({
      jokeText: job.jokeText,
      jokeTitle: job.jokeTitle,
      style: "nature",
    });

    // Сохраняем URL видео фона в джобу
    await updateVideoJobStatus({
      id: jobId,
      status: "running",
      backgroundVideoUrl: backgroundResult.videoUrl,
      backgroundPrompt: backgroundResult.revisedPrompt,
    });

    console.log("Background video generated successfully:", backgroundResult.videoUrl);

    // Списываем кредиты за фон ТОЛЬКО если userId передан и генерация успешна
    if (userId) {
      try {
        await deductCredits(
          userId,
          BACKGROUND_COST,
          "background_generation",
          "Background generation (luma-direct)",
          {
            modelName: "luma-direct",
            style: "nature",
            generationId: backgroundResult.generationId,
            videoUrl: backgroundResult.videoUrl,
            jobId: jobId?.toString(),
          }
        );
        console.log("✅ Credits deducted for background generation:", BACKGROUND_COST);
      } catch (deductError) {
        console.error("⚠️ Failed to deduct credits for background:", deductError);
        // Продолжаем, даже если не удалось списать кредиты
      }
    }

    // 2. Генерируем аудио через Ace-Step API
    console.log("Generating audio for video job:", jobId);
    try {
      const audioResult = await generateAudio({
        jokeText: job.jokeText,
        jokeTitle: job.jokeTitle,
        modelName: "ace-step", // Используем Ace-Step (дешевле)
        taskType: "txt2audio",
        lyricsType: "instrumental",
        duration: 5, // 5 секунд для shorts
      });

      // Сохраняем URL аудио в джобу
      await updateVideoJobStatus({
        id: jobId,
        status: "running",
        audioUrl: audioResult.audioUrl,
      });

      console.log("Audio generated successfully:", audioResult.audioUrl);

      // Списываем кредиты за аудио ТОЛЬКО если userId передан и генерация успешна
      if (userId) {
        try {
          await deductCredits(
            userId,
            AUDIO_COST,
            "audio_generation",
            "Audio generation (ace-step, 5 sec)",
            {
              modelName: "ace-step",
              lyricsType: "instrumental",
              duration: 5,
              generationId: audioResult.generationId,
              audioUrl: audioResult.audioUrl,
              jobId: jobId?.toString(),
            }
          );
          console.log("✅ Credits deducted for audio generation:", AUDIO_COST);
        } catch (deductError) {
          console.error("⚠️ Failed to deduct credits for audio:", deductError);
          // Продолжаем, даже если не удалось списать кредиты
        }
      }
    } catch (audioError) {
      console.error("Failed to generate audio, continuing without audio:", audioError);
      // Продолжаем без аудио - видео можно будет создать и без него
    }

    // 3. TODO: Здесь будет рендеринг финального видео через Remotion Lambda
    // const videoUrl = await renderVideoWithRemotionLambda({
    //   backgroundVideoUrl: backgroundResult.videoUrl,
    //   jokeText: job.jokeText,
    //   jokeTitle: job.jokeTitle,
    // });
    
    // 4. TODO: Сохранение в Cloudflare R2
    // await uploadToR2(videoUrl);
    
    // Пока симулируем завершение после генерации фона
    // В реальности здесь будет ожидание завершения рендеринга
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    await updateVideoJobStatus({
      id: jobId,
      status: "completed",
    });
  } catch (error) {
    console.error("Failed to process video job", error);
    await updateVideoJobStatus({
      id: jobId,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

