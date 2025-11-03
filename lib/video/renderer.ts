import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";

const execAsync = promisify(exec);

/**
 * Рендерит финальное видео с текстом и эмодзи поверх видео-фона
 * Использует FFmpeg для наложения текста и эмодзи на видео
 */
export type EmojiAnimationType = "none" | "pulse" | "rotate" | "bounce" | "fade";

export interface RenderVideoOptions {
  backgroundVideoUrl: string;
  jokeTitle?: string;
  editedText: string;
  emoji?: string;
  emojiAnimation?: EmojiAnimationType; // Тип анимации эмодзи
  jobId: string;
}

export interface RenderVideoResult {
  videoUrl: string;
  filePath: string;
  duration: number;
}

/**
 * Создает выражение анимации для эмодзи
 * @param animationType Тип анимации
 * @param baseValue Базовое значение (размер или координата)
 * @param param Дополнительный параметр (для разных типов анимации)
 * @returns FFmpeg выражение для анимации
 */
function createEmojiAnimationExpression(
  animationType: EmojiAnimationType,
  baseValue: number,
  param: "x" | "y" | "scale" = "scale"
): string {
  if (animationType === "none") {
    return baseValue.toString();
  }

  // t - время в секундах от начала видео
  // 2*PI - полный цикл
  // Используем sin/cos для плавной анимации
  
  switch (animationType) {
    case "pulse": {
      // Пульсация размера: от 0.9 до 1.1 от базового размера
      if (param === "scale") {
        return `${baseValue}*(0.9+0.1*sin(2*PI*t/1.5))`;
      }
      // Для координат не применяем pulse
      return baseValue.toString();
    }
    
    case "rotate": {
      // Вращение с небольшим смещением координат
      if (param === "x") {
        const offset = 10; // Радиус вращения
        return `${baseValue}+${offset}*sin(2*PI*t/2)`;
      }
      if (param === "y") {
        const offset = 10;
        return `${baseValue}+${offset}*cos(2*PI*t/2)`;
      }
      return baseValue.toString();
    }
    
    case "bounce": {
      // Подпрыгивание: вертикальное движение
      if (param === "y") {
        const bounceHeight = 15; // Высота подпрыгивания
        // Используем abs(sin) для эффекта подпрыгивания
        return `${baseValue}-${bounceHeight}*abs(sin(2*PI*t/1.2))`;
      }
      return baseValue.toString();
    }
    
    case "fade": {
      // Fade in для overlay (через alpha)
      // Этот тип анимации применяется через отдельный параметр
      return baseValue.toString();
    }
    
    default:
      return baseValue.toString();
  }
}

/**
 * Проверяет наличие FFmpeg в системе
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Рендерит финальное видео используя FFmpeg
 * Сохраняет результат локально в public/videos/
 */
export async function renderFinalVideo(
  options: RenderVideoOptions
): Promise<RenderVideoResult> {
  const { 
    backgroundVideoUrl, 
    jokeTitle, 
    editedText, 
    emoji = "😂", 
    emojiAnimation = "pulse",
    jobId 
  } = options;

  // Проверяем наличие FFmpeg
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error(
      "FFmpeg не установлен. Установите FFmpeg:\n" +
      "macOS: brew install ffmpeg\n" +
      "Ubuntu/Debian: sudo apt-get install ffmpeg\n" +
      "Windows: скачайте с https://ffmpeg.org/download.html"
    );
  }

  // Создаем директорию для видео если её нет
  const videosDir = path.join(process.cwd(), "public", "videos");
  await fs.mkdir(videosDir, { recursive: true });

  // Пути для временных файлов и результата
  const tempVideoPath = path.join(videosDir, `temp_${jobId}.mp4`);
  const outputVideoPath = path.join(videosDir, `final_${jobId}.mp4`);
  const outputVideoUrl = `/videos/final_${jobId}.mp4`;

  try {
    // 1. Скачиваем видео-фон
    console.log("Downloading background video:", backgroundVideoUrl);
    const videoResponse = await fetch(backgroundVideoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download background video: ${videoResponse.statusText}`);
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    await fs.writeFile(tempVideoPath, videoBuffer);
    console.log("Background video downloaded");

    // 2. Подготавливаем текст для наложения
    // Разбиваем текст на строки для компактного отображения (как в preview)
    // Для вертикального видео 720px: ~18 символов на строку создаст узкий контейнер как в preview
    const maxCharsPerLine = 40;
    const wrapText = (text: string): string => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxCharsPerLine) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
          // Если одно слово длиннее maxCharsPerLine, разбиваем его принудительно
          if (currentLine.length > maxCharsPerLine) {
            const chunks = currentLine.match(new RegExp(`.{1,${maxCharsPerLine}}`, 'g')) || [];
            lines.push(...chunks.slice(0, -1));
            currentLine = chunks[chunks.length - 1] || '';
          }
        }
      }
      if (currentLine) lines.push(currentLine);
      
      return lines.join('\n');
    };

    let textToRender = editedText;
    if (jokeTitle) {
      textToRender = `${jokeTitle}\n\n${editedText}`;
    }
    
    const wrappedText = wrapText(textToRender);
    
    // Вычисляем параметры текста для позиционирования эмодзи
    const lineCount = wrappedText.split('\n').length;
    const lineHeight = 22 + 10; // fontsize + line_spacing
    const textBoxPadding = 24; // boxborderw
    const estimatedTextHeight = lineCount * lineHeight + textBoxPadding * 2;
    // Примерная ширина текста: ~85% от ширины видео (720px)
    const estimatedTextWidth = Math.floor(720 * 0.85);
    
    // Создаем временный файл для текста, чтобы избежать проблем с экранированием
    const textFilePath = path.join(videosDir, `text_${jobId}.txt`);
    await fs.writeFile(textFilePath, wrappedText, 'utf-8');
    
    // Проверяем что файл создан и содержит текст
    const textFileStats = await fs.stat(textFilePath);
    const textFileContent = await fs.readFile(textFilePath, 'utf-8');
    console.log(`Text file created: ${textFilePath}, size: ${textFileStats.size} bytes, content length: ${textFileContent.length}`);
    if (textFileStats.size === 0 || textFileContent.length === 0) {
      throw new Error("Text file is empty!");
    }
    
    // Для эмодзи используем FFmpeg напрямую с правильным шрифтом
    // Создаем изображение эмодзи через временный подход
    const emojiImagePath = path.join(videosDir, `emoji_${jobId}.png`);
    try {
      await createEmojiImage(emoji, emojiImagePath);
    } catch (error) {
      console.warn("Failed to create emoji image, will use drawtext fallback:", error);
      // В случае ошибки будем использовать drawtext напрямую
    }

    // Проверяем существование и размер файла эмодзи
    let emojiExists = false;
    try {
      const stats = await fs.stat(emojiImagePath);
      emojiExists = stats.size > 0; // Файл должен быть не пустым
      console.log(`Emoji file check: exists=${emojiExists}, size=${stats.size} bytes`);
    } catch {
      console.warn("Emoji file does not exist or is empty, will use drawtext fallback");
      emojiExists = false;
    }

    // 3. Создаем команду FFmpeg для наложения текста и эмодзи
    // Используем сложный фильтр для лучшего контроля
    return new Promise((resolve, reject) => {
      // Создаем фильтр с полупрозрачным фоном для текста (как в preview)
      // Используем complex filter для обработки видео и наложения эмодзи
      // [0:v] - первое видео (background)
      // [1:v] - второе изображение (emoji)
      // Экранируем путь к файлу текста для FFmpeg
      // Для textfile в drawtext нужно экранировать одинарные кавычки внутри пути
      // Формат: textfile='path' где одинарные кавычки внутри path экранируются как '\''
      const escapedTextFilePath = textFilePath.replace(/'/g, "'\\''");
      
      // Позиционируем эмодзи в правом нижнем углу текста
      // Текст находится по центру экрана (720x1280)
      // Правый край текста: центр + половина ширины текста = 720/2 + estimatedTextWidth/2
      // Нижний край текста: центр + половина высоты текста = 1280/2 + estimatedTextHeight/2
      // Размер эмодзи: 64x64, добавляем небольшой отступ (8px) от края текста
      // Overlay позиционирует левый верхний угол, поэтому вычитаем размер эмодзи
      const emojiSize = 64;
      const emojiOffset = 8; // Отступ от края текста
      // Вычисляем абсолютные координаты (текст центрирован, поэтому используем вычисленные значения)
      const textRightEdge = 360 + Math.floor(estimatedTextWidth / 2); // 360 = w/2 = 720/2
      const textBottomEdge = 640 + Math.floor(estimatedTextHeight / 2); // 640 = h/2 = 1280/2
      const baseEmojiX = textRightEdge - emojiSize - emojiOffset;
      const baseEmojiY = textBottomEdge - emojiSize - emojiOffset;
      
      // Применяем анимацию к координатам
      const animatedEmojiX = createEmojiAnimationExpression(emojiAnimation, baseEmojiX, "x");
      const animatedEmojiY = createEmojiAnimationExpression(emojiAnimation, baseEmojiY, "y");
      
      console.log("Text file path:", textFilePath);
      console.log("Escaped text file path:", escapedTextFilePath);
      console.log("Emoji exists:", emojiExists);
      console.log("Emoji animation:", emojiAnimation);
      console.log("Emoji position - X:", animatedEmojiX, "Y:", animatedEmojiY);
      
      let filterComplex: string;
      if (emojiExists) {
        // Создаем фильтр для эмодзи с анимацией
        // Используем scale2ref или правильный синтаксис для динамического масштабирования
        let emojiFilter = `[1:v]fps=fps=25`;
        
        // FFmpeg scale не поддерживает выражения с временем (t) напрямую
        // Для всех анимаций используем статический размер
        // Pulse эффект будет создан через координаты и визуальное движение
        emojiFilter += `,scale=${emojiSize}:${emojiSize}`;
        
        // Для fade анимации добавляем alpha
        if (emojiAnimation === "fade") {
          // Fade in за 0.5 секунды, затем полностью видимый
          emojiFilter += `,format=rgba,colorchannelmixer=aa='if(lt(t,0.5),t*2,1)'`;
        }
        
        emojiFilter += `[emoji]`;
        
        // Определяем выражение для overlay
        // Если выражение содержит функции (sin, cos, etc.), оборачиваем в кавычки
        const needsQuotes = emojiAnimation !== "none" && (animatedEmojiX.includes("sin") || animatedEmojiX.includes("cos") || animatedEmojiX.includes("abs") || animatedEmojiY.includes("sin") || animatedEmojiY.includes("cos") || animatedEmojiY.includes("abs"));
        const emojiXExpr = needsQuotes ? `'${animatedEmojiX}'` : animatedEmojiX;
        const emojiYExpr = needsQuotes ? `'${animatedEmojiY}'` : animatedEmojiY;
        
        // Для pulse используем упрощенный подход: изменение координат для визуального эффекта
        // Реальный pulse (изменение размера) требует более сложных фильтров
        let overlayXExpr = emojiXExpr;
        let overlayYExpr = emojiYExpr;
        
        if (emojiAnimation === "pulse") {
          // Для pulse создаем эффект пульсации через большее движение
          // Комбинируем движение по кругу и вперед-назад для визуального эффекта пульсации
          const pulseAmplitude = 8; // Амплитуда движения для пульсации
          // Движение вперед-назад (к камере и от камеры)
          overlayXExpr = `'${baseEmojiX}+${pulseAmplitude}*sin(2*PI*t/1.5)'`;
          overlayYExpr = `'${baseEmojiY}+${pulseAmplitude}*sin(2*PI*t/1.5)'`;
        }
        
        let overlayExpression = `${overlayXExpr}:${overlayYExpr}`;
        
        // Для fade добавляем параметр alpha
        if (emojiAnimation === "fade") {
          overlayExpression += `:enable='between(t,0,999)'`;
        }
        
        filterComplex = [
          // Обрабатываем фоновое видео: масштабируем, добавляем padding, накладываем текст
          `[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,drawtext=textfile='${escapedTextFilePath}':fontcolor=black@1:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=white@0.6:boxborderw=24:line_spacing=10[v0]`,
          // Применяем анимацию к эмодзи
          emojiFilter,
          // Накладываем эмодзи поверх видео с текстом с анимированными координатами
          `[v0][emoji]overlay=${overlayExpression}[v]`
        ].join(";");
        console.log("Using complex filter with emoji image and animation");
        console.log("Filter:", filterComplex);
      } else {
        // Используем drawtext напрямую с шрифтом эмодзи
        const escapedEmoji = emoji.replace(/'/g, "'\\''");
        let emojiFontPath = "/System/Library/Fonts/Supplemental/Apple Color Emoji.ttc";
        if (process.platform === "linux") {
          emojiFontPath = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";
        } else if (process.platform === "win32") {
          emojiFontPath = "C:/Windows/Fonts/seguiemj.ttf";
        }
        
        // Экранируем путь к шрифту
        const escapedFontPath = emojiFontPath.replace(/:/g, '\\:').replace(/'/g, "'\\''");
        
        // Используем вычисленные координаты для позиционирования эмодзи
        // В drawtext можно использовать text_w и text_h из предыдущего фильтра, но для надежности
        // используем вычисленные значения, аналогично overlay
        const emojiFontSize = 56;
        // Для drawtext размер эмодзи 56px (вместо 64px для изображения)
        // Корректируем позицию: добавляем разницу в размерах (64-56=8px)
        const baseEmojiXDrawtext = baseEmojiX + (emojiSize - emojiFontSize);
        const baseEmojiYDrawtext = baseEmojiY + (emojiSize - emojiFontSize);
        
        // Применяем анимацию к координатам (drawtext поддерживает выражения)
        // Для pulse в drawtext можно использовать динамический fontsize
        let emojiSizeExpression = emojiFontSize.toString();
        if (emojiAnimation === "pulse") {
          // Пульсация размера шрифта
          emojiSizeExpression = `${emojiFontSize}*(0.9+0.1*sin(2*PI*t/1.5))`;
        }
        
        // Создаем анимированные координаты
        const animatedEmojiXDrawtext = createEmojiAnimationExpression(
          emojiAnimation,
          baseEmojiXDrawtext,
          "x"
        );
        const animatedEmojiYDrawtext = createEmojiAnimationExpression(
          emojiAnimation,
          baseEmojiYDrawtext,
          "y"
        );
        
        // Оборачиваем выражения в кавычки если они содержат функции
        const needsQuotesDrawtext = emojiAnimation !== "none" && (
          animatedEmojiXDrawtext.includes("sin") || 
          animatedEmojiXDrawtext.includes("cos") || 
          animatedEmojiYDrawtext.includes("sin") || 
          animatedEmojiYDrawtext.includes("cos") ||
          emojiSizeExpression.includes("sin") ||
          emojiSizeExpression.includes("cos")
        );
        const emojiXDrawtextExpr = needsQuotesDrawtext ? `'${animatedEmojiXDrawtext}'` : animatedEmojiXDrawtext;
        const emojiYDrawtextExpr = needsQuotesDrawtext ? `'${animatedEmojiYDrawtext}'` : animatedEmojiYDrawtext;
        const emojiSizeDrawtextExpr = needsQuotesDrawtext && emojiSizeExpression.includes("sin") ? `'${emojiSizeExpression}'` : emojiSizeExpression;
        
        filterComplex = [
          // Обрабатываем фоновое видео: масштабируем, добавляем padding, накладываем текст и эмодзи
          `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,drawtext=textfile='${escapedTextFilePath}':fontcolor=black@1:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=white@0.6:boxborderw=24:line_spacing=10,drawtext=text='${escapedEmoji}':fontfile='${escapedFontPath}':fontcolor=black@1:fontsize=${emojiSizeDrawtextExpr}:x=${emojiXDrawtextExpr}:y=${emojiYDrawtextExpr}`
        ].join(",");
        console.log("Using simple video filter with drawtext and animation");
        console.log("Emoji animation:", emojiAnimation);
        console.log("Emoji position (drawtext) - X:", animatedEmojiXDrawtext, "Y:", animatedEmojiYDrawtext);
        console.log("Filter:", filterComplex);
      }

      // Создаем базовую команду FFmpeg
      let command = ffmpeg(tempVideoPath);
      
      // Добавляем вход для изображения эмодзи, если оно существует
      if (emojiExists) {
        // Для статического изображения нужно указать loop и framerate
        command = command
          .input(emojiImagePath)
          .inputOptions([
            "-loop", "1",
            "-framerate", "25" // Устанавливаем framerate для синхронизации с видео
          ]);
      }
      
      // Настраиваем опции вывода
      const outputOpts = [
        // Видео кодек
        "-c:v libx264",
        "-preset medium",
        "-crf 23",
        "-pix_fmt yuv420p",
        // Аудио кодек (копируем если есть, иначе добавляем тишину)
        "-c:a aac",
        "-b:a 128k",
        "-shortest",
      ];
      
      // Добавляем фильтр в зависимости от метода
      if (emojiExists) {
        // Используем complex filter для наложения изображения
        // Сначала указываем filter_complex, потом мапим выходные потоки
        outputOpts.push("-filter_complex", filterComplex);
        outputOpts.push("-map", "[v]");
        // Мапим аудио из первого входа (если есть)
        outputOpts.push("-map", "0:a?");
      } else {
        // Используем обычный video filter для drawtext
        // При использовании -vf видео мапится автоматически, НЕ нужно указывать -map 0:v
        outputOpts.push("-vf", filterComplex);
        // Аудио нужно указать явно, но только если оно есть
        outputOpts.push("-map", "0:a?");
      }
      
      // Выводим финальную команду для отладки
      console.log("Output options:", outputOpts);
      
      // Применяем опции ПЕРЕД указанием выходного файла
      command = command.outputOptions(outputOpts);
      
      command
        .output(outputVideoPath)
        .on("start", (commandLine) => {
          console.log("FFmpeg command:", commandLine);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log("Rendering progress:", Math.round(progress.percent), "%");
          }
        })
        .on("end", async () => {
          try {
            // Получаем длительность видео
            const duration = await getVideoDuration(outputVideoPath);
            
            // Удаляем временные файлы
            await fs.unlink(tempVideoPath).catch(() => {});
            await fs.unlink(textFilePath).catch(() => {});
            await fs.unlink(emojiImagePath).catch(() => {});

            console.log("Video rendering completed:", outputVideoUrl);
            resolve({
              videoUrl: outputVideoUrl,
              filePath: outputVideoPath,
              duration,
            });
          } catch (error) {
            reject(error);
          }
        })
        .on("error", (error: Error) => {
          console.error("FFmpeg error:", error);
          console.error("Error message:", error.message);
          // Удаляем временные файлы в случае ошибки
          fs.unlink(tempVideoPath).catch(() => {});
          fs.unlink(textFilePath).catch(() => {});
          fs.unlink(emojiImagePath).catch(() => {});
          reject(new Error(`FFmpeg error: ${error.message}`));
        })
        .run();
    });
  } catch (error) {
    // Удаляем временные файлы в случае ошибки
    const textFilePath = path.join(process.cwd(), "public", "videos", `text_${jobId}.txt`);
    const emojiImagePath = path.join(process.cwd(), "public", "videos", `emoji_${jobId}.png`);
    await fs.unlink(tempVideoPath).catch(() => {});
    await fs.unlink(textFilePath).catch(() => {});
    await fs.unlink(emojiImagePath).catch(() => {});
    throw error;
  }
}

/**
 * Создает PNG изображение с эмодзи используя Twemoji API
 * Twemoji предоставляет цветные изображения эмодзи от Twitter
 */
async function createEmojiImage(emoji: string, outputPath: string): Promise<void> {
  // Конвертируем эмодзи в Unicode codepoint для Twemoji URL
  const codePoint = emoji.codePointAt(0)?.toString(16);
  
  if (!codePoint) {
    throw new Error(`Invalid emoji: ${emoji}`);
  }
  
  // Twemoji CDN URL для SVG эмодзи (высокое качество)
  // Для составных эмодзи (с модификаторами) нужно обработать все codepoints
  const codePoints: string[] = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp) {
      codePoints.push(cp.toString(16));
    }
  }
  const emojiCode = codePoints.join('-');
  
  // Используем PNG версию Twemoji для лучшей совместимости с FFmpeg
  const twemojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${emojiCode}.png`;
  
  console.log(`Downloading emoji from Twemoji: ${twemojiUrl}`);
  
  try {
    // Скачиваем изображение эмодзи
    const response = await fetch(twemojiUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download emoji: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
    
    console.log(`Emoji image downloaded and saved: ${outputPath}`);
  } catch (error) {
    console.error(`Failed to download emoji from Twemoji:`, error);
    throw error;
  }
}

/**
 * Получает длительность видео в секундах
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch (error) {
    console.error("Failed to get video duration:", error);
    return 0;
  }
}

/**
 * Удаляет видео файл
 */
export async function deleteVideoFile(videoUrl: string): Promise<void> {
  try {
    const fileName = path.basename(videoUrl);
    const filePath = path.join(process.cwd(), "public", "videos", fileName);
    await fs.unlink(filePath);
    console.log("Video file deleted:", filePath);
  } catch (error) {
    console.error("Failed to delete video file:", error);
  }
}