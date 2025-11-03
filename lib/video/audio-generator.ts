export interface GenerateAudioOptions {
  jokeText: string;
  jokeTitle?: string;
  taskType?: "txt2audio-base" | "txt2audio-full"; // 1'35" high quality или 4'45" lower quality
}

export interface GenerateAudioResult {
  audioUrl: string;
  generationId?: string;
  duration?: number; // Длительность в секундах
}

/**
 * Генерирует музыку для YouTube Shorts через PiAPI/DiffRhythm
 * Создает AI-музыку с синхронизированными вокалом и инструментами
 */
export async function generateAudio(
  options: GenerateAudioOptions
): Promise<GenerateAudioResult> {
  const { jokeText, jokeTitle, taskType = "txt2audio-base" } = options;

  // Создаем промпт для генерации музыки
  const prompt = createAudioPrompt({
    jokeText,
    jokeTitle,
  });

  const apiKey = process.env.PIAPI_X_API_KEY || "bf691bd4c7a534dc2c2c24f19c950d7a5c57eee25ed636c46185ad5e0b09b147";

  if (!apiKey) {
    throw new Error("PIAPI_X_API_KEY environment variable is not set");
  }

  // Генерируем аудио через PiAPI/DiffRhythm
  // Согласно документации: POST https://api.piapi.ai/api/v1/task
  const response = await fetch("https://api.piapi.ai/api/v1/task", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "Qubico/diffrhythm",
      task_type: taskType,
      input: {
        prompt: prompt,
        // DiffRhythm поддерживает английский и китайский, но можем попробовать испанский
        // Для лучших результатов лучше переводить на английский
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
    console.error("PiAPI/DiffRhythm error:", response.status, errorText);
    throw new Error(`PiAPI/DiffRhythm request failed: ${response.status} ${errorText}`);
  }

  const responseData = await response.json();
  
  // API возвращает ответ в формате { code, data, message }
  // task_id находится в data.task_id
  const taskId = responseData.data?.task_id || responseData.task_id;
  const status = responseData.data?.status || responseData.status;
  
  if (!taskId) {
    console.error("Unexpected PiAPI/DiffRhythm response format:", JSON.stringify(responseData, null, 2));
    throw new Error(`Unexpected PiAPI/DiffRhythm response format: ${JSON.stringify(responseData)}`);
  }

  // Асинхронная генерация - нужно ждать завершения
  console.log(`Audio generation task created. Task ID: ${taskId}, Status: ${status}`);
  const audioUrl = await pollForDiffRhythmCompletion(apiKey, taskId, taskType);
  
  return {
    audioUrl,
    generationId: taskId,
    duration: taskType === "txt2audio-base" ? 95 : 285, // 1'35" или 4'45"
  };
}

/**
 * Ожидает завершения генерации аудио через DiffRhythm
 * Проверяет статус задачи через GET /api/v1/task/{task_id}
 * Таймаут: 5 минут для base, 10 минут для full
 */
async function pollForDiffRhythmCompletion(
  apiKey: string, 
  taskId: string, 
  taskType: "txt2audio-base" | "txt2audio-full",
  maxAttempts = 200
): Promise<string> {
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
      if (status === "completed" || status === "Completed") {
        // Извлекаем URL аудио из ответа
        const extractAudioUrl = (audio: unknown): string | null => {
          if (!audio) return null;
          // Если это строка - возвращаем как есть
          if (typeof audio === "string") {
            return audio;
          }
          // Если это объект - извлекаем url
          if (typeof audio === "object" && audio !== null && "url" in audio) {
            const audioObj = audio as { url: string };
            return audioObj.url;
          }
          return null;
        };

        const audioUrl = 
          extractAudioUrl(data.output?.audio) ||
          extractAudioUrl(data.output?.audio_file) ||
          data.output?.audio_url ||
          data.output?.url ||
          extractAudioUrl(data.result?.audio) ||
          data.result?.audio_url ||
          data.audio_url ||
          data.url;

        if (audioUrl) {
          console.log("Audio generated successfully:", audioUrl);
          return audioUrl;
        }
        
        // Логируем полный ответ для отладки
        console.error("Task completed but no audio URL found. Full response:", JSON.stringify(responseData, null, 2));
        throw new Error(`Audio generation completed but no URL found. Response: ${JSON.stringify(responseData)}`);
      }

      // Ошибка генерации
      if (status === "failed" || status === "Failed") {
        const errorData = data.error || responseData.error || {};
        const errorMsg = errorData.message || errorData.raw_message || responseData.message || "Unknown error";
        
        // Более понятные сообщения на русском для частых ошибок
        if (errorMsg.includes("insufficient credits") || errorMsg.includes("credit")) {
          throw new Error(
            `Недостаточно кредитов на аккаунте PiAPI для генерации аудио. ` +
            `Пожалуйста, пополните баланс на https://piapi.ai или проверьте статус аккаунта. ` +
            `(Error: ${errorMsg})`
          );
        }
        
        throw new Error(`DiffRhythm audio generation failed: ${errorMsg}`);
      }

      // Если статус еще обрабатывается, ждем
      if (status === "processing" || status === "Processing" || 
          status === "pending" || status === "Pending" ||
          status === "staged" || status === "Staged") {
        // Логируем прогресс если доступен
        if (data.progress !== undefined) {
          console.log(`Task progress: ${data.progress}%`);
        }
        // Ждем перед следующей попыткой (для аудио генерация быстрее, можно ждать меньше)
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // Неизвестный статус - ждем и пробуем снова
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      // Если это не последняя попытка, продолжаем
      if (attempt < maxAttempts - 1) {
        console.error(`Error checking task status (attempt ${attempt + 1}):`, error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`DiffRhythm audio generation timed out after ${maxAttempts * 2} seconds`);
}

/**
 * Создает промпт для генерации музыки на основе анекдота
 * DiffRhythm поддерживает английский и китайский, поэтому переводим на английский
 */
function createAudioPrompt(options: {
  jokeText: string;
  jokeTitle?: string;
}): string {
  const { jokeText, jokeTitle } = options;
  
  // Для лучших результатов лучше использовать английский промпт
  // Можно упростить и использовать основную тему анекдота
  
  // Базовый промпт для веселой фоновой музыки
  const basePrompt = "upbeat, cheerful, light background music, happy and energetic mood, suitable for comedy and humor content";
  
  // Добавляем контекст из темы анекдота (если есть title)
  const context = jokeTitle 
    ? `, theme: ${jokeTitle}`
    : ", Spanish humor style";
  
  // Для txt2audio можно использовать более описательный промпт
  return `${basePrompt}${context}, instrumental with subtle melodies, modern production, perfect for short video format`;
}

