import { LumaAI } from "lumaai";

export interface GenerateLumaVideoOptions {
  prompt: string;
  model?: "ray-flash-2" | "ray-2" | "ray-1-6";
  resolution?: "540p" | "720p" | "1080p" | "4k";
  duration?: "5s";
  keyframes?: {
    frame0?: {
      type: "image";
      url: string;
    };
    frame1?: {
      type: "image" | "generation";
      url?: string;
      id?: string;
    };
  };
  loop?: boolean;
}

export interface GenerateLumaVideoResult {
  videoUrl: string;
  generationId: string;
  prompt: string;
}

/**
 * Генерирует видео через прямой API Luma AI
 * Используется модель Ray Flash 2 для быстрой и дешевой генерации
 * Стоимость: $0.14 за видео (540p, 5sec)
 * Цена для пользователя: $0.25 (25 центов или 25 кредитов)
 */
export async function generateLumaVideo(
  options: GenerateLumaVideoOptions
): Promise<GenerateLumaVideoResult> {
  const {
    prompt,
    model = "ray-flash-2",
    resolution = "540p",
    duration = "5s",
    keyframes,
    loop = false,
  } = options;

  const apiKey = process.env.LUMAAI_API_KEY;

  if (!apiKey) {
    throw new Error("LUMAAI_API_KEY environment variable is not set");
  }

  const client = new LumaAI({
    authToken: apiKey,
  });

  console.log("Creating Luma generation:", {
    model,
    resolution,
    duration,
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
  });

  // Создаем задачу генерации
  let generation = await client.generations.create({
    prompt,
    model,
    resolution,
    duration,
    keyframes,
    loop,
  });

  console.log(`Luma generation created. ID: ${generation.id}, State: ${generation.state}`);

  // Ожидаем завершения генерации
  let completed = false;
  let attempts = 0;
  const maxAttempts = 200; // 200 * 3sec = 10 минут

  while (!completed && attempts < maxAttempts) {
    attempts++;

    // Получаем актуальный статус
    generation = await client.generations.get(generation.id);

    if (generation.state === "completed") {
      completed = true;
      console.log(`Luma generation completed successfully after ${attempts} attempts`);
    } else if (generation.state === "failed") {
      const errorMsg = generation.failure_reason || "Unknown error";
      console.error(`Luma generation failed: ${errorMsg}`);
      throw new Error(`Luma generation failed: ${errorMsg}`);
    } else {
      // Все еще обрабатывается
      console.log(`Luma dreaming... (attempt ${attempts}/${maxAttempts}, state: ${generation.state})`);
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Ждем 3 секунды
    }
  }

  if (!completed) {
    throw new Error(`Luma generation timed out after ${maxAttempts * 3} seconds`);
  }

  // Получаем URL видео
  const videoUrl = generation.assets?.video;

  if (!videoUrl) {
    console.error("Luma generation completed but no video URL found:", generation);
    throw new Error("Luma generation completed but no video URL found");
  }

  console.log("Luma video URL:", videoUrl);

  return {
    videoUrl,
    generationId: generation.id,
    prompt,
  };
}

/**
 * Скачивает видео с Luma URL и возвращает Buffer
 */
export async function downloadLumaVideo(videoUrl: string): Promise<Buffer> {
  console.log("Downloading Luma video from:", videoUrl);

  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(`Failed to download Luma video: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`Luma video downloaded, size: ${buffer.length} bytes`);

  return buffer;
}
