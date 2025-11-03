import { findVideoJobById, updateVideoJobStatus } from "./storage";
import { generateBackground } from "./background-generator";
import { generateAudio } from "./audio-generator";

/**
 * Обрабатывает видео джобу
 * 1. Генерирует видео фон через OpenAI Sora
 * 2. В будущем: рендерит финальное видео через Remotion Lambda
 * 3. Сохраняет в Cloudflare R2
 */
export async function processVideoJob(jobId: unknown): Promise<void> {
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

    // 1. Генерируем видео фон через OpenAI Sora
    console.log("Generating background video for video job:", jobId);
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

    // 2. Генерируем аудио через DiffRhythm
    console.log("Generating audio for video job:", jobId);
    try {
      const audioResult = await generateAudio({
        jokeText: job.jokeText,
        jokeTitle: job.jokeTitle,
        taskType: "txt2audio-base", // Используем high-quality версию (1'35")
      });

      // Сохраняем URL аудио в джобу
      await updateVideoJobStatus({
        id: jobId,
        status: "running",
        audioUrl: audioResult.audioUrl,
      });

      console.log("Audio generated successfully:", audioResult.audioUrl);
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

