export interface GenerateBackgroundOptions {
  jokeText: string;
  jokeTitle?: string;
  style?: "nature" | "abstract" | "minimalist";
}

export interface GenerateBackgroundResult {
  videoUrl: string;
  revisedPrompt?: string;
  generationId?: string;
}

/**
 * Генерирует видео фон для YouTube Shorts через PiAPI/Luma Dream Machine
 * Создает вертикальное видео (9:16) в природном стиле
 */
export async function generateBackground(
  options: GenerateBackgroundOptions
): Promise<GenerateBackgroundResult> {
  const { jokeText, jokeTitle, style = "nature" } = options;

  // Создаем промпт для генерации видео фона
  const prompt = createBackgroundPrompt({
    jokeText,
    jokeTitle,
    style,
  });

  const apiKey = process.env.PIAPI_X_API_KEY || "bf691bd4c7a534dc2c2c24f19c950d7a5c57eee25ed636c46185ad5e0b09b147";

  if (!apiKey) {
    throw new Error("PIAPI_X_API_KEY environment variable is not set");
  }

  // Генерируем видео через PiAPI/Luma Dream Machine
  // Согласно документации: POST https://api.piapi.ai/api/v1/task
  const response = await fetch("https://api.piapi.ai/api/v1/task", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "luma",
      task_type: "video_generation",
      input: {
        prompt: prompt,
        model_name: "ray-v1", // ray-v2 для лучшего качества (можно использовать ray-v1)
        duration: 5, // 10 секунд для txt2video (можно использовать 5)
        aspect_ratio: "9:16", // Вертикальный формат для YouTube Shorts
        resolution: 540, // 768 (поддерживается 6s/10s; 1080p+10s нельзя)
      },
      config: {
        webhook_config: {
          endpoint: "",
          secret: "",
        },
        service_mode: "public", // PAYG mode
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PiAPI/Luma error:", response.status, errorText);
    throw new Error(`PiAPI/Luma request failed: ${response.status} ${errorText}`);
  }

  const responseData = await response.json();
  
  // API возвращает ответ в формате { code, data, message }
  // task_id находится в data.task_id
  const taskId = responseData.data?.task_id || responseData.task_id;
  const status = responseData.data?.status || responseData.status;
  
  if (!taskId) {
    console.error("Unexpected PiAPI/Luma response format:", JSON.stringify(responseData, null, 2));
    throw new Error(`Unexpected PiAPI/Luma response format: ${JSON.stringify(responseData)}`);
  }

  // Асинхронная генерация - нужно ждать завершения
  console.log(`Video generation task created. Task ID: ${taskId}, Status: ${status}`);
  const videoUrl = await pollForLumaCompletion(apiKey, taskId);
  return {
    videoUrl,
    revisedPrompt: prompt,
    generationId: taskId,
  };
}


/**
 * Ожидает завершения генерации видео через Luma Dream Machine
 * Проверяет статус задачи через GET /api/v1/task/{task_id}
 * Таймаут: 10 минут (200 попыток * 3 секунды)
 */
async function pollForLumaCompletion(apiKey: string, taskId: string, maxAttempts = 300): Promise<string> {
  // Согласно документации: GET https://api.piapi.ai/api/v1/task/{task_id}
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to check task status: ${response.status}`);
      }

      const responseData = await response.json();
      
      // API возвращает ответ в формате { code, data, message }
      const data = responseData.data || responseData;
      const status = data.status;
      
      console.log(`Task ${taskId} status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);
      
      // Успешное завершение
      // Согласно документации Luma, статус может быть "Completed" (с большой буквы)
      if (status === "completed" || status === "Completed") {
        // Согласно документации Luma, видео находится в data.output.video или data.output.video_raw
        // API может возвращать как строку URL, так и объект { url, width, height }
        const extractVideoUrl = (video: unknown): string | null => {
          if (!video) return null;
          // Если это строка - возвращаем как есть
          if (typeof video === "string") {
            return video;
          }
          // Если это объект - извлекаем url
          if (typeof video === "object" && video !== null && "url" in video) {
            const videoObj = video as { url: string };
            return videoObj.url;
          }
          return null;
        };

        const videoUrl = 
          extractVideoUrl(data.output?.video) ||
          extractVideoUrl(data.output?.video_raw) ||
          data.output?.video_url ||
          data.output?.url ||
          extractVideoUrl(data.result?.video) ||
          data.result?.video_url ||
          data.video_url ||
          data.url;

        if (videoUrl) {
          console.log("Background video generated successfully:", data.output?.video || data.output?.video_raw || { url: videoUrl });
          return videoUrl;
        }
        
        // Логируем полный ответ для отладки
        console.error("Task completed but no video URL found. Full response:", JSON.stringify(responseData, null, 2));
        throw new Error(`Video generation completed but no URL found. Response: ${JSON.stringify(responseData)}`);
      }

      // Ошибка генерации
      if (status === "failed" || status === "Failed") {
        const errorData = data.error || responseData.error || {};
        const errorMsg = errorData.message || errorData.raw_message || responseData.message || "Unknown error";
        
        // Более понятные сообщения на русском для частых ошибок
        if (errorMsg.includes("insufficient credits") || errorMsg.includes("credit")) {
          throw new Error(
            `Недостаточно кредитов на аккаунте PiAPI для генерации видео. ` +
            `Пожалуйста, пополните баланс на https://piapi.ai или проверьте статус аккаунта. ` +
            `(Error: ${errorMsg})`
          );
        }
        
        throw new Error(`Luma video generation failed: ${errorMsg}`);
      }

      // Если статус еще обрабатывается, ждем
      // Согласно документации Luma: Processing, Pending, Staged
      if (status === "processing" || status === "Processing" || 
          status === "pending" || status === "Pending" ||
          status === "staged" || status === "Staged") {
        // Логируем прогресс если доступен
        if (data.progress !== undefined) {
          console.log(`Task progress: ${data.progress}%`);
        }
        // Ждем перед следующей попыткой
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      // Неизвестный статус - ждем и пробуем снова
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      // Если это не последняя попытка, продолжаем
      if (attempt < maxAttempts - 1) {
        console.error(`Error checking task status (attempt ${attempt + 1}):`, error);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Luma video generation timed out after 10 minutes");
}


function createBackgroundPrompt(options: {
  jokeText: string;
  jokeTitle?: string;
  style: "nature" | "abstract" | "minimalist";
}): string {
  const { jokeTitle, style } = options;
  // jokeText не используется напрямую в промпте для избежания проблем с модерацией

  // Базовый промпт для природного фона
  const basePrompt = style === "nature"
    ? "Beautiful animated nature background, vibrant colors, happy and cheerful atmosphere, perfect for humorous content"
    : style === "abstract"
      ? "Colorful abstract background, modern design, energetic and joyful mood, suitable for comedy content"
      : "Clean minimalist background, soft colors, elegant design, positive and light mood";

  // Добавляем контекст из анекдота (без прямого упоминания текста, чтобы избежать проблем с модерацией)
  const context = jokeTitle
    ? `, related to the theme: ${jokeTitle}`
    : ", suitable for Spanish humor content";

  return `${basePrompt}${context}. Vertical format 9:16 ratio, high quality, vibrant colors, no text, no people, landscape or nature scene`;
}

