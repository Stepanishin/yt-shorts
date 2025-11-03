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
 * Генерирует видео фон для YouTube Shorts через OpenAI Sora 2
 * Создает вертикальное видео (720x1280, Portrait) в природном стиле
 */
export async function generateBackground(
  options: GenerateBackgroundOptions
): Promise<GenerateBackgroundResult> {
  const { jokeText, jokeTitle, style = "nature" } = options;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  // Создаем промпт для генерации видео фона
  const prompt = createBackgroundPrompt({
    jokeText,
    jokeTitle,
    style,
  });

  // Пытаемся сгенерировать видео с автоматическим повторением при внутренних ошибках
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} for video generation...`);
        // Ждем перед повторной попыткой (увеличиваем время с каждой попыткой)
        await new Promise((resolve) => setTimeout(resolve, attempt * 5000 + 2000));
      }

      // Генерируем видео через Sora API
      // Endpoint: /v1/videos согласно документации OpenAI
      const response = await fetch("https://api.openai.com/v1/videos", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sora-2",
          prompt: prompt,
          // Portrait формат для вертикального видео (720x1280)
          size: "720x1280", // Формат: ширина×высота для портретной ориентации
        }),
      });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Sora API error:", response.status, errorText);
      
      // Пытаемся распарсить JSON ошибки для более понятного сообщения
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          // Проверяем на специфичные ошибки
          if (errorData.error.message.includes("organization must be verified") || 
              errorData.error.message.includes("must be verified")) {
            throw new Error(
              `Доступ к Sora еще не активирован. ` +
              `Если вы только что верифицировали организацию, подождите до 15 минут для активации доступа. ` +
              `Проверьте статус на https://platform.openai.com/settings/organization/general`
            );
          }
          throw new Error(`Failed to generate video: ${errorData.error.message}`);
        }
      } catch {
        // Если не удалось распарсить JSON, используем исходный текст
      }
      
      throw new Error(`Failed to generate video: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Проверяем формат ответа Sora API
    let videoUrl: string;
    let generationId: string | undefined;

    // Sora может возвращать видео напрямую или через асинхронную генерацию
    if (data.video_url) {
      // Готовое видео
      videoUrl = data.video_url;
      generationId = data.id;
    } else if (data.url) {
      videoUrl = data.url;
      generationId = data.id;
    } else if (data.id && (
      data.status === "pending" || 
      data.status === "processing" || 
      data.status === "queued" ||
      data.status === "in_progress"
    )) {
      // Асинхронная генерация - нужно ждать завершения
      console.log(`Video generation queued/processing, waiting for completion. ID: ${data.id}, Status: ${data.status}`);
      generationId = data.id;
      videoUrl = await pollForVideoCompletion(generationId!);
    } else if (data.data && data.data[0]?.video_url) {
      videoUrl = data.data[0].video_url;
    } else if (data.data && data.data[0]?.url) {
      videoUrl = data.data[0].url;
    } else {
      console.error("Unexpected Sora API response format:", JSON.stringify(data, null, 2));
      throw new Error(`Failed to get video URL from Sora API response. Response: ${JSON.stringify(data)}`);
    }

      return {
        videoUrl,
        revisedPrompt: prompt,
        generationId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to generate background video with Sora (attempt ${attempt + 1}/${maxRetries}):`, errorMessage);
      
      // Проверяем, можно ли повторить попытку
      const isRetryable = errorMessage.includes("internal error") || 
                         errorMessage.includes("temporary") ||
                         errorMessage.includes("timeout") ||
                         errorMessage.includes("rate limit");
      
      if (isRetryable && attempt < maxRetries - 1) {
        lastError = error instanceof Error ? error : new Error(String(error));
        continue; // Пробуем еще раз
      }
      
      // Если это последняя попытка или ошибка не повторяемая - выбрасываем
      throw error;
    }
  }

  // Если все попытки исчерпаны
  throw lastError || new Error("Failed to generate video after all retry attempts");
}

/**
 * Ожидает завершения генерации видео и возвращает URL готового видео
 */
async function pollForVideoCompletion(generationId: string, maxAttempts = 60): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.openai.com/v1/videos/${generationId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check video generation status: ${response.status}`);
    }

    const data = await response.json();
    
    // Успешное завершение
    if (data.status === "succeeded" || data.status === "completed" || data.status === "success") {
      // Логируем полный ответ для отладки
      console.log("Video generation completed. Full response:", JSON.stringify(data, null, 2));
      
      // Проверяем все возможные поля с URL
      if (data.video_url) {
        return data.video_url;
      } else if (data.url) {
        return data.url;
      } else if (data.video) {
        // Возможно URL вложен в объект video
        if (typeof data.video === "string") {
          return data.video;
        } else if (data.video.url) {
          return data.video.url;
        } else if (data.video.video_url) {
          return data.video.video_url;
        }
      } else if (data.result?.video_url) {
        return data.result.video_url;
      } else if (data.result?.url) {
        return data.result.url;
      } else if (data.output?.video_url) {
        return data.output.video_url;
      } else if (data.output?.url) {
        return data.output.url;
      }
      
      // Если URL не найден в ответе, но статус completed - ждем немного и запрашиваем снова
      // Иногда URL появляется в следующем запросе после завершения
      if (data.id && data.status === "completed") {
        console.log(`Video completed but URL not in response, waiting and retrying...`);
        // Ждем 2 секунды и запрашиваем еще раз
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        // Повторный запрос для получения URL
        const retryResponse = await fetch(`https://api.openai.com/v1/videos/${data.id}`, {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        });
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          console.log("Retry response:", JSON.stringify(retryData, null, 2));
          
          if (retryData.video_url) {
            return retryData.video_url;
          } else if (retryData.url) {
            return retryData.url;
          }
        }
        
        // Если все еще нет URL, пробуем endpoint /download
        console.log(`Trying /download endpoint for video ID: ${data.id}`);
        try {
          const downloadResponse = await fetch(`https://api.openai.com/v1/videos/${data.id}/download`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            redirect: "follow", // Автоматически следуем редиректам
          });
          
          if (downloadResponse.ok) {
            // Проверяем final URL после всех редиректов
            const finalUrl = downloadResponse.url;
            if (finalUrl && finalUrl.includes("http") && !finalUrl.includes("/v1/videos")) {
              console.log(`Got video URL from download endpoint: ${finalUrl}`);
              return finalUrl;
            }
            
            // Или проверяем заголовок Location
            const location = downloadResponse.headers.get("location");
            if (location) {
              console.log(`Got video URL from Location header: ${location}`);
              return location;
            }
            
            // Или может быть в теле ответа
            const contentType = downloadResponse.headers.get("content-type");
            if (contentType && contentType.startsWith("application/json")) {
              const downloadData = await downloadResponse.json();
              if (downloadData.url || downloadData.video_url) {
                return downloadData.url || downloadData.video_url;
              }
            }
          }
        } catch (downloadError) {
          console.error("Download endpoint error:", downloadError);
        }
      }
      
      // Если ничего не найдено, выводим ошибку с полным ответом
      throw new Error(
        `Video generation completed but no URL found. ` +
        `Response: ${JSON.stringify(data)}. ` +
        `Video ID: ${data.id}. ` +
        `Попробуйте проверить видео вручную на https://platform.openai.com или обратитесь в поддержку OpenAI.`
      );
    }

    // Ошибка генерации
    if (data.status === "failed" || data.status === "error") {
      const errorMsg = data.error?.message || data.error || "Unknown error";
      console.error(`Video generation failed. Status: ${data.status}, Error:`, errorMsg);
      
      // Проверяем тип ошибки для более понятного сообщения
      if (errorMsg.includes("internal error")) {
        throw new Error(
          `Внутренняя ошибка OpenAI при генерации видео. ` +
          `Это временная проблема на стороне сервера. ` +
          `Попробуйте позже или повторите запрос. ` +
          `(Error: ${errorMsg})`
        );
      }
      
      throw new Error(`Video generation failed: ${errorMsg}`);
    }

    // Продолжаем ждать для статусов: queued, pending, processing, in_progress
    // Логируем прогресс если доступен
    if (data.progress !== undefined) {
      console.log(`Video generation progress: ${data.progress}% (Status: ${data.status})`);
    }

    // Ждем перед следующей попыткой (3 секунды для видео генерации)
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Video generation timed out after 3 minutes");
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

