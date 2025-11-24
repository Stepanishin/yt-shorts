export interface GenerateBackgroundOptions {
  jokeText: string;
  jokeTitle?: string;
  style?: "nature" | "abstract" | "minimalist";
  modelName?: "ray-v1"; // Пока только одна модель доступна
}

export interface GenerateBackgroundResult {
  videoUrl: string;
  revisedPrompt?: string;
  generationId?: string;
}

/**
 * Генерирует видео фон для YouTube Shorts через PiAPI/Luma Dream Machine
 * Создает вертикальное видео (9:16) в природном стиле
 * При ошибке повторяет попытку после задержки
 */
export async function generateBackground(
  options: GenerateBackgroundOptions,
  maxRetries = 3,
  retryDelayMs = 60000
): Promise<GenerateBackgroundResult> {
  const { jokeText, jokeTitle, style = "nature", modelName = "ray-v1" } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Background generation attempt ${attempt}/${maxRetries}`);

      // Создаем промпт для генерации видео фона
      const prompt = createBackgroundPrompt({
        jokeText,
        jokeTitle,
        style,
      });

      const apiKey = process.env.PIAPI_X_API_KEY;

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
            model_name: modelName,
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

      // Успех! Возвращаем результат
      console.log(`Background generation successful on attempt ${attempt}`);
      return {
        videoUrl,
        revisedPrompt: prompt,
        generationId: taskId,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Background generation attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Если это не последняя попытка, ждем перед повторной попыткой
      if (attempt < maxRetries) {
        console.log(`Waiting ${retryDelayMs / 1000} seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  // Все попытки исчерпаны
  throw new Error(
    `Failed to generate background after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
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
      // Если ошибка содержит "generation failed", это означает что задача провалилась
      // Нужно выбросить ошибку, чтобы верхний уровень мог сделать retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("generation failed") || errorMessage.includes("insufficient credits")) {
        throw error; // Прокидываем ошибку наверх для retry
      }

      // Если это сетевая ошибка или другая временная проблема, продолжаем попытки
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

  // Разнообразные варианты фонов для каждого стиля
  const natureVariants = [
    "Beautiful mountain landscape with flowing waterfall, sunrise lighting, peaceful atmosphere",
    "Tropical beach with palm trees swaying in wind, crystal clear water, golden hour lighting",
    "Forest path with sunlight filtering through trees, autumn colors, gentle breeze",
    "Ocean waves crashing on rocks, dramatic sky with clouds, sunset colors",
    "Flower field with butterflies, bright spring day, vibrant colors blooming",
    "Desert landscape with sand dunes, starry night sky, peaceful ambiance",
    "River flowing through green valley, birds flying, morning mist",
    "Snow-capped mountains with pine forest, clear blue sky, fresh winter day",
    "Rolling hills with green meadows, rainbow after rain, cheerful mood",
    "Lake reflection with mountains, dawn colors, serene atmosphere",
  ];

  const abstractVariants = [
    "Colorful geometric shapes flowing and morphing, modern design, energetic vibes",
    "Liquid paint swirling in vibrant colors, abstract art style, dynamic movement",
    "Neon lights patterns dancing, futuristic aesthetic, bright glowing colors",
    "Floating particles creating patterns, minimalist modern design, soft movements",
    "Gradient waves flowing smoothly, contemporary style, calming yet vibrant",
    "Bokeh light effects with colorful orbs, elegant abstract design, dreamy atmosphere",
    "Ink drops spreading in water, artistic style, mesmerizing color blends",
    "Digital glitch art with color shifts, modern tech aesthetic, dynamic energy",
    "Kaleidoscope patterns rotating, psychedelic colors, hypnotic movements",
    "Paper cutout layers moving, flat design style, playful colorful scene",
  ];

  const minimalistVariants = [
    "Clean gradient background with soft pastel colors, elegant simplicity, peaceful mood",
    "Subtle geometric patterns, monochromatic palette, sophisticated design",
    "Soft clouds floating in clear sky, minimal elements, tranquil atmosphere",
    "Simple curved lines animation, modern minimal style, soothing motion",
    "Smooth color transitions, warm tones, calming visual experience",
    "Minimal particle effects, white and gold accents, luxury feel",
    "Zen garden elements, natural stones and sand, meditative simplicity",
    "Soft light rays through window, minimal interior, warm comfortable setting",
    "Abstract water ripples, clear and pure, minimal distraction",
    "Gentle fabric waves, soft textures, elegant and clean aesthetic",
  ];

  // Выбираем случайный вариант в зависимости от стиля
  let variants: string[];
  if (style === "abstract") {
    variants = abstractVariants;
  } else if (style === "minimalist") {
    variants = minimalistVariants;
  } else {
    variants = natureVariants;
  }

  // Используем детерминированную "случайность" на основе текущего времени
  // чтобы каждый раз получать разные результаты
  const randomIndex = Math.floor(Math.random() * variants.length);
  const basePrompt = variants[randomIndex];

  // Добавляем общие параметры
  const suffix = jokeTitle
    ? `, theme inspired by: ${jokeTitle}`
    : ", suitable for Spanish humor content";

  return `${basePrompt}${suffix}. Vertical format 9:16 ratio, high quality, cinematic, no text overlays, no people`;
}

