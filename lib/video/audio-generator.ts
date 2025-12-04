export interface GenerateAudioOptions {
  jokeText: string;
  jokeTitle?: string;
  taskType?: "generate_music" | "generate_music_custom" | "txt2audio"; // Udio или Ace-Step task types
  lyricsType?: "generate" | "user" | "instrumental"; // How to generate the music
  lyrics?: string; // Optional lyrics (used when lyricsType is "user")
  modelName?: "llm" | "ace-step"; // llm = Udio, ace-step = Qubico Ace-Step
  duration?: number; // Длительность для Ace-Step (10-240 секунд), по умолчанию 30
}

export interface GenerateAudioResult {
  audioUrl: string;
  generationId?: string;
  duration?: number; // Длительность в секундах
}

/**
 * Генерирует музыку для YouTube Shorts через PiAPI/Udio API
 * Создает AI-музыку используя передовые возможности Udio
 * При ошибке повторяет попытку после задержки
 */
export async function generateAudio(
  options: GenerateAudioOptions,
  maxRetries = 3,
  retryDelayMs = 60000
): Promise<GenerateAudioResult> {
  const {
    modelName = "ace-step", // По умолчанию используем Ace-Step (дешевле)
  } = options;

  // Используем разные функции в зависимости от модели
  if (modelName === "ace-step") {
    return generateAudioWithAceStep(options, maxRetries, retryDelayMs);
  } else {
    return generateAudioWithUdio(options, maxRetries, retryDelayMs);
  }
}

/**
 * Генерирует музыку через Udio API
 */
async function generateAudioWithUdio(
  options: GenerateAudioOptions,
  maxRetries = 3,
  retryDelayMs = 60000
): Promise<GenerateAudioResult> {
  const {
    jokeText,
    jokeTitle,
    taskType = "generate_music",
    lyricsType = "instrumental",
    lyrics,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Audio generation attempt ${attempt}/${maxRetries}`);

      // Создаем промпт для генерации музыки
      const gptDescriptionPrompt = createAudioPrompt({
        jokeText,
        jokeTitle,
      });

      const apiKey = process.env.PIAPI_X_API_KEY;

      if (!apiKey) {
        throw new Error("PIAPI_X_API_KEY environment variable is not set");
      }

      // Генерируем аудио через PiAPI/Udio API
      // Согласно документации: POST https://api.piapi.ai/api/v1/task
      const requestBody: {
        model: string;
        task_type: string;
        input: {
          gpt_description_prompt?: string;
          prompt?: string;
          lyrics_type: string;
          lyrics?: string;
          title?: string;
        };
        config: {
          webhook_config: {
            endpoint: string;
            secret: string;
          };
          service_mode: string;
        };
      } = {
        model: "music-u",
        task_type: taskType,
        input: {
          lyrics_type: lyricsType,
        },
        config: {
          webhook_config: {
            endpoint: "",
            secret: "",
          },
          service_mode: "public", // PAYG mode ($0.05 per generation)
        },
      };

      // Добавляем промпт в зависимости от lyrics_type
      if (lyricsType === "generate" || lyricsType === "instrumental") {
        // Используем gpt_description_prompt для автогенерации
        requestBody.input.gpt_description_prompt = gptDescriptionPrompt;
      } else if (lyricsType === "user" && lyrics) {
        // Используем точный промпт и тексты от пользователя
        requestBody.input.prompt = gptDescriptionPrompt;
        requestBody.input.lyrics = lyrics;
      }

      // Добавляем title если есть
      if (jokeTitle) {
        requestBody.input.title = jokeTitle;
      }

      const response = await fetch("https://api.piapi.ai/api/v1/task", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("PiAPI/Udio (music-u) error:", response.status, errorText);
        throw new Error(`PiAPI/Udio music generation request failed: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();

      // API возвращает ответ в формате { code, data, message }
      // task_id находится в data.task_id
      const taskId = responseData.data?.task_id || responseData.task_id;
      const status = responseData.data?.status || responseData.status;

      if (!taskId) {
        console.error("Unexpected PiAPI/Udio response format:", JSON.stringify(responseData, null, 2));
        throw new Error(`Unexpected PiAPI/Udio response format: ${JSON.stringify(responseData)}`);
      }

      // Асинхронная генерация - нужно ждать завершения
      console.log(`Udio music generation task created. Task ID: ${taskId}, Status: ${status}`);
      const result = await pollForUdioCompletion(apiKey, taskId);

      // Успех! Возвращаем результат
      console.log(`Audio generation successful on attempt ${attempt}`);
      return {
        audioUrl: result.audioUrl,
        generationId: taskId,
        duration: result.duration, // Фактическая длительность из Udio API
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Audio generation attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Если это не последняя попытка, ждем перед повторной попыткой
      if (attempt < maxRetries) {
        console.log(`Waiting ${retryDelayMs / 1000} seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  // Все попытки исчерпаны
  throw new Error(
    `Failed to generate audio after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Ожидает завершения генерации музыки через Udio API
 * Проверяет статус задачи через GET /api/v1/task/{task_id}
 * Музыка хранится на сервере PiAPI 7 дней
 */
async function pollForUdioCompletion(
  apiKey: string,
  taskId: string,
  maxAttempts = 150 // ~5 минут с интервалом 2 секунды
): Promise<{ audioUrl: string; duration: number }> {
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
        // Udio API возвращает массив songs в output.songs[]
        // Каждая песня имеет song_path с URL музыкального файла
        let audioUrl: string | null = null;

        // Проверяем новый формат Udio API (output.songs[])
        if (data.output?.songs && Array.isArray(data.output.songs) && data.output.songs.length > 0) {
          // Берем первую песню из массива
          const firstSong = data.output.songs[0];
          audioUrl = firstSong.song_path;
          const duration = Math.round(firstSong.duration || 131); // Округляем до секунд

          // Логируем информацию о сгенерированных треках
          console.log(`Udio generated ${data.output.songs.length} songs:`);
          data.output.songs.forEach((song: any, index: number) => {
            console.log(`  ${index + 1}. "${song.title}" (${Math.round(song.duration)}s) - ${song.song_path}`);
          });
          console.log(`Using first song: "${firstSong.title}" (${duration}s)`);

          if (audioUrl) {
            console.log("Udio music generated successfully:", audioUrl);
            console.log("⚠️  Музыка хранится на сервере PiAPI 7 дней. Сохраните на Cloudflare R2 для постоянного хранения.");
            return { audioUrl, duration };
          }
        } else {
          // Fallback: проверяем старые форматы (на случай если API изменится)
          const extractAudioUrl = (audio: unknown): string | null => {
            if (!audio) return null;
            if (typeof audio === "string") return audio;
            if (typeof audio === "object" && audio !== null && "url" in audio) {
              return (audio as { url: string }).url;
            }
            return null;
          };

          audioUrl =
            extractAudioUrl(data.output?.audio) ||
            extractAudioUrl(data.output?.audio_file) ||
            data.output?.audio_url ||
            data.output?.url ||
            extractAudioUrl(data.result?.audio) ||
            data.result?.audio_url ||
            data.audio_url ||
            data.url;
        }

        if (audioUrl) {
          console.log("Udio music generated successfully (fallback format):", audioUrl);
          console.log("⚠️  Музыка хранится на сервере PiAPI 7 дней. Сохраните на Cloudflare R2 для постоянного хранения.");
          return { audioUrl, duration: 131 }; // Дефолтная длительность для fallback
        }

        // Логируем полный ответ для отладки
        console.error("Task completed but no audio URL found. Full response:", JSON.stringify(responseData, null, 2));
        throw new Error(`Udio music generation completed but no URL found. Response: ${JSON.stringify(responseData)}`);
      }

      // Ошибка генерации
      if (status === "failed" || status === "Failed") {
        const errorData = data.error || responseData.error || {};
        const errorMsg = errorData.message || errorData.raw_message || responseData.message || "Unknown error";

        // Более понятные сообщения на русском для частых ошибок
        if (errorMsg.includes("insufficient credits") || errorMsg.includes("credit")) {
          throw new Error(
            `Недостаточно кредитов на аккаунте PiAPI для генерации музыки через Udio. ` +
            `Стоимость: $0.05 за генерацию (PAYG mode). ` +
            `Пожалуйста, пополните баланс на https://piapi.ai. ` +
            `(Error: ${errorMsg})`
          );
        }

        throw new Error(`Udio music generation failed: ${errorMsg}`);
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
      // Если ошибка содержит "generation failed", это означает что задача провалилась
      // Нужно выбросить ошибку, чтобы верхний уровень мог сделать retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("generation failed") || errorMessage.includes("insufficient credits")) {
        throw error; // Прокидываем ошибку наверх для retry
      }

      // Если это сетевая ошибка или другая временная проблема, продолжаем попытки
      if (attempt < maxAttempts - 1) {
        console.error(`Error checking task status (attempt ${attempt + 1}):`, error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Udio music generation timed out after ${maxAttempts * 2} seconds`);
}

/**
 * Создает промпт для генерации музыки через Udio на основе анекдота
 * Udio использует продвинутые AI модели для создания высококачественной музыки
 */
function createAudioPrompt(options: {
  jokeText: string;
  jokeTitle?: string;
}): string {
  const { jokeText, jokeTitle } = options;

  // Если jokeText короткий (меньше 200 символов) и не содержит типичных признаков шутки,
  // считаем что это кастомный промпт от пользователя и используем его напрямую
  const looksLikeCustomPrompt = jokeText.length < 200 && !jokeText.includes('\n') && !jokeText.includes('—');

  if (looksLikeCustomPrompt && jokeText.trim().length > 0) {
    console.log("Using custom user prompt for audio:", jokeText);
    return `${jokeText}, instrumental, modern production, perfect for YouTube Shorts, 30-45 seconds`;
  }

  // Иначе используем предустановленный промпт для безопасности
  console.log("Using preset prompt for audio generation");

  // Базовый промпт для веселой фоновой музыки
  const basePrompt = "upbeat cheerful background music, light and energetic, comedy vibe, fun and playful";

  // Добавляем контекст из темы анекдота (если есть title)
  const context = jokeTitle
    ? `, ${jokeTitle} theme`
    : ", Spanish humor style";

  // Udio поддерживает детальные описания стиля, жанра и настроения
  return `${basePrompt}${context}, instrumental, modern production, catchy melody, perfect for YouTube Shorts, 30-45 seconds`;
}

/**
 * Генерирует инструментальную музыку через Qubico Ace-Step API
 * Дешевле чем Udio: $0.0005 за секунду (30 сек = $0.015 = ~2 кредита)
 */
async function generateAudioWithAceStep(
  options: GenerateAudioOptions,
  maxRetries = 3,
  retryDelayMs = 60000
): Promise<GenerateAudioResult> {
  const {
    jokeText,
    duration = 10, // По умолчанию 10 секунд
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Ace-Step audio generation attempt ${attempt}/${maxRetries}`);

      // Создаем style_prompt на основе текста
      const stylePrompt = createAceStepStylePrompt(jokeText);

      const apiKey = process.env.PIAPI_X_API_KEY;

      if (!apiKey) {
        throw new Error("PIAPI_X_API_KEY environment variable is not set");
      }

      // Формируем запрос к Ace-Step API
      const requestBody = {
        model: "Qubico/ace-step",
        task_type: "txt2audio",
        input: {
          style_prompt: stylePrompt,
          negative_style_prompt: "noise, distortion, low quality",
          lyrics: "[inst]", // Инструментальная музыка без слов
          duration: Math.min(Math.max(duration, 10), 30), // Ограничиваем 10-240 секунд (максимум API)
        },
        config: {
          webhook_config: {
            endpoint: "",
            secret: "",
          },
        },
      };

      console.log(`Ace-Step request:`, {
        style_prompt: stylePrompt,
        duration: requestBody.input.duration,
      });

      const response = await fetch("https://api.piapi.ai/api/v1/task", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("PiAPI/Ace-Step error:", response.status, errorText);
        throw new Error(`PiAPI/Ace-Step request failed: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();

      // API возвращает task_id для асинхронной генерации
      const taskId = responseData.data?.task_id || responseData.task_id;
      const status = responseData.data?.status || responseData.status;

      if (!taskId) {
        console.error("Unexpected PiAPI/Ace-Step response:", JSON.stringify(responseData, null, 2));
        throw new Error(`Unexpected PiAPI/Ace-Step response format: ${JSON.stringify(responseData)}`);
      }

      console.log(`Ace-Step task created. Task ID: ${taskId}, Status: ${status}`);

      // Ждем завершения генерации
      const result = await pollForAceStepCompletion(apiKey, taskId);

      console.log(`Ace-Step generation successful on attempt ${attempt}`);
      return {
        audioUrl: result.audioUrl,
        generationId: taskId,
        duration: requestBody.input.duration,
      };
    } catch (error) {
      lastError = error as Error;
      console.error(`Ace-Step generation attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryDelayMs / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw new Error(
    `Ace-Step audio generation failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`
  );
}

/**
 * Создает style_prompt для Ace-Step на основе текста
 */
function createAceStepStylePrompt(jokeText: string): string {
  // Если текст короткий и выглядит как кастомный промпт, используем его
  const looksLikeCustomPrompt = jokeText.length < 200 && !jokeText.includes('\n') && !jokeText.includes('—');

  if (looksLikeCustomPrompt && jokeText.trim().length > 0) {
    console.log("Using custom style prompt for Ace-Step:", jokeText);
    return jokeText.trim();
  }

  // Иначе используем универсальный стиль для фоновой музыки
  console.log("Using preset style prompt for Ace-Step");
  return "upbeat cheerful instrumental music, guitar and piano, energetic, modern, perfect for background";
}

/**
 * Проверяет статус задачи Ace-Step и ждет завершения генерации
 */
async function pollForAceStepCompletion(
  apiKey: string,
  taskId: string,
  maxAttempts = 60 // 60 попыток * 2 сек = 2 минуты
): Promise<{ audioUrl: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error checking Ace-Step task status:", response.status, errorText);
        throw new Error(`Failed to check Ace-Step task status: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const taskData = data.data || data;
      const status = taskData.status;

      console.log(`Ace-Step task ${taskId} status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);

      if (status === "completed") {
        const audioUrl = taskData.output?.audio_url;
        if (!audioUrl) {
          throw new Error("Ace-Step generation completed but no audio_url in response");
        }
        console.log(`Ace-Step audio ready: ${audioUrl}`);
        return { audioUrl };
      }

      if (status === "failed") {
        const errorMessage = taskData.error?.message || "Unknown error";
        throw new Error(`Ace-Step generation failed: ${errorMessage}`);
      }

      if (status === "pending" || status === "processing") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // Неизвестный статус - ждем и пробуем снова
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("generation failed") || errorMessage.includes("insufficient credits")) {
        throw error;
      }

      if (attempt < maxAttempts - 1) {
        console.error(`Error checking Ace-Step status (attempt ${attempt + 1}):`, error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Ace-Step audio generation timed out after ${maxAttempts * 2} seconds`);
}

