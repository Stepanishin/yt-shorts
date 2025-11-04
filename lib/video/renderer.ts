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
  audioUrl?: string; // URL аудио для наложения на видео
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
    audioUrl,
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
  const tempAudioPath = audioUrl ? path.join(videosDir, `temp_audio_${jobId}.mp3`) : null;
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

    // 1.5. Скачиваем аудио, если предоставлено
    if (audioUrl && tempAudioPath) {
      console.log("Downloading audio:", audioUrl);
      try {
        const audioResponse = await fetch(audioUrl);
        if (audioResponse.ok) {
          const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
          await fs.writeFile(tempAudioPath, audioBuffer);
          console.log("Audio downloaded successfully");
        } else {
          console.warn("Failed to download audio, continuing without audio:", audioResponse.statusText);
        }
      } catch (audioError) {
        console.warn("Failed to download audio, continuing without audio:", audioError);
      }
    }

    // 2. Подготавливаем текст для наложения
    // Разбиваем текст на строки для компактного отображения (как в preview)
    // Для вертикального видео 720px: уменьшаем символов на строку для безопасных отступов
    const maxCharsPerLine = 35; // Уменьшено с 40 до 35 для безопасности
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
    const fontSize = 36; // Увеличенный размер шрифта
    const lineSpacing = 15; // Увеличенный межстрочный интервал
    const lineCount = wrappedText.split('\n').length;
    const lineHeight = fontSize + lineSpacing;
    const textBoxPadding = 30; // boxborderw

    // Размеры видео
    const videoWidth = 720;
    const videoHeight = 1280;

    // Безопасные отступы от краев видео
    const safeMarginHorizontal = 60; // Минимум 30px с каждой стороны
    const safeMarginVertical = 100; // Минимум 50px сверху и снизу

    // Максимальные размеры контейнера с учетом отступов
    const maxTextWidth = videoWidth - safeMarginHorizontal * 2; // 600px максимум
    const maxTextHeight = videoHeight - safeMarginVertical * 2; // 1080px максимум

    // Ширина текста: ~75% от ширины видео, но не больше maxTextWidth
    const estimatedTextWidth = Math.min(Math.floor(videoWidth * 0.75), maxTextWidth);

    // Высота текста: вычисляем по количеству строк, но не больше maxTextHeight
    let estimatedTextHeight = lineCount * lineHeight + textBoxPadding * 2;
    estimatedTextHeight = Math.min(estimatedTextHeight, maxTextHeight);

    console.log(`Text container dimensions: ${estimatedTextWidth}x${estimatedTextHeight} (${lineCount} lines)`);
    console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);
    console.log(`Safe margins: horizontal=${safeMarginHorizontal}, vertical=${safeMarginVertical}`);
    
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

    // 3. Проверяем существование аудио файла (если был скачан)
    const hasAudioFile = tempAudioPath ? await fs.stat(tempAudioPath).then(() => true).catch(() => false) : false;
    
    // 3.5. Получаем длительность видео-фона и аудио
    let videoDuration = 0;
    let audioDuration = 0;
    try {
      videoDuration = await getVideoDuration(tempVideoPath);
      console.log(`Background video duration: ${videoDuration} seconds`);

      if (hasAudioFile && tempAudioPath) {
        audioDuration = await getVideoDuration(tempAudioPath); // ffprobe работает и с аудио
        console.log(`Audio duration: ${audioDuration} seconds`);
      }
    } catch (error) {
      console.warn("Failed to get video duration:", error);
      // Используем дефолтную длительность 5 секунд если не удалось получить
      videoDuration = 5;
    }

    // Зацикливаем видео для получения ровно 10 секунд
    const targetDuration = 10; // Всегда 10 секунд
    console.log(`Target video duration: ${targetDuration} seconds (video will be looped)`);

    // Количество циклов видео (округление вверх)
    const videoLoops = Math.ceil(targetDuration / videoDuration) - 1; // -1 потому что loop=0 означает 1 воспроизведение
    console.log(`Video will loop ${videoLoops} time(s) to reach ${targetDuration} seconds`);
    
    // 4. Создаем команду FFmpeg для наложения текста и эмодзи
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
      
      // Позиционируем эмодзи ВНЕ контейнера текста - справа снизу от белого бокса
      // Текст находится по центру экрана (720x1280)
      // Правый край текста: центр + половина ширины текста = 720/2 + estimatedTextWidth/2
      // Нижний край текста: центр + половина высоты текста = 1280/2 + estimatedTextHeight/2
      const emojiSize = 64;
      const emojiOffsetFromBox = 10; // Отступ от края белого бокса
      // Вычисляем абсолютные координаты (текст центрирован, поэтому используем вычисленные значения)
      const textRightEdge = 360 + Math.floor(estimatedTextWidth / 2); // 360 = w/2 = 720/2
      const textBottomEdge = 640 + Math.floor(estimatedTextHeight / 2); // 640 = h/2 = 1280/2

      // Эмодзи СНАРУЖИ контейнера: справа и ниже белого бокса
      const baseEmojiX = textRightEdge - emojiSize - emojiOffsetFromBox;
      const baseEmojiY = textBottomEdge + emojiOffsetFromBox; // +50 пикселей ниже контейнера
      
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
          // Обрабатываем фоновое видео: зацикливаем, масштабируем, добавляем padding, накладываем текст
          `[0:v]loop=loop=${videoLoops}:size=32767:start=0,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,drawtext=textfile='${escapedTextFilePath}':fontcolor=black@1:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=white@0.6:boxborderw=${textBoxPadding}:line_spacing=${lineSpacing}:borderw=1:bordercolor=black[v0]`,
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

        // Позиционируем эмодзи ВНЕ контейнера текста - справа снизу от белого бокса
        // Используем estimatedTextHeight и estimatedTextWidth
        const emojiFontSize = 56;
        const emojiOffsetFromBox = 10; // Отступ от края белого бокса

        // Вычисляем позицию эмодзи ЗА пределами контейнера
        // Контейнер текста центрирован: x=(w-textWidth)/2, y=(h-textHeight)/2
        // Правый нижний угол контейнера: x=360+textWidth/2, y=640+textHeight/2
        const textRightEdge = 360 + Math.floor(estimatedTextWidth / 2); // 360 = 720/2
        const textBottomEdge = 640 + Math.floor(estimatedTextHeight / 2); // 640 = 1280/2

        // Эмодзи СНАРУЖИ контейнера: добавляем отступ вместо вычитания
        const baseEmojiXDrawtext = textRightEdge - emojiFontSize - emojiOffsetFromBox;
        const baseEmojiYDrawtext = textBottomEdge + emojiOffsetFromBox; // +50 пикселей ниже

        // Применяем анимацию к координатам и размеру
        let emojiSizeExpression = emojiFontSize.toString();
        let emojiXExpression = baseEmojiXDrawtext.toString();
        let emojiYExpression = baseEmojiYDrawtext.toString();

        if (emojiAnimation === "pulse") {
          // Пульсация размера шрифта
          emojiSizeExpression = `${emojiFontSize}*(0.9+0.1*sin(2*PI*t/1.5))`;
        } else if (emojiAnimation === "rotate") {
          // Вращение с небольшим смещением координат
          const offset = 10;
          emojiXExpression = `${baseEmojiXDrawtext}+${offset}*sin(2*PI*t/2)`;
          emojiYExpression = `${baseEmojiYDrawtext}+${offset}*cos(2*PI*t/2)`;
        } else if (emojiAnimation === "bounce") {
          // Подпрыгивание: вертикальное движение
          const bounceHeight = 15;
          emojiYExpression = `${baseEmojiYDrawtext}-${bounceHeight}*abs(sin(2*PI*t/1.2))`;
        }
        
        filterComplex = [
          // Обрабатываем фоновое видео: зацикливаем, масштабируем, добавляем padding, накладываем текст и эмодзи
          `loop=loop=${videoLoops}:size=32767:start=0,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,drawtext=textfile='${escapedTextFilePath}':fontcolor=black@1:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=white@0.6:boxborderw=${textBoxPadding}:line_spacing=${lineSpacing}:borderw=2:bordercolor=black,drawtext=text='${escapedEmoji}':fontfile='${escapedFontPath}':fontcolor=black@1:fontsize=${emojiSizeExpression}:x=${emojiXExpression}:y=${emojiYExpression}`
        ].join(",");
        console.log("Using simple video filter with drawtext and animation");
        console.log("Emoji animation:", emojiAnimation);
        console.log("Emoji position (drawtext) - X:", emojiXExpression, "Y:", emojiYExpression);
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
      
      // Добавляем вход для аудио, если оно скачано
      let audioInputIndex = 1; // Индекс для аудио (после видео и возможного эмодзи)
      if (emojiExists) audioInputIndex = 2; // Если есть эмодзи, аудио будет третьим входом
      
      if (hasAudioFile && tempAudioPath) {
        command = command.input(tempAudioPath);
        console.log("Audio input added to FFmpeg command");
      }
      
      // Настраиваем опции вывода
      const outputOpts = [
        // Видео кодек
        "-c:v libx264",
        "-preset medium",
        "-crf 23",
        "-pix_fmt yuv420p",
        // Аудио кодек
        "-c:a aac",
        "-b:a 128k",
      ];
      
      // Явно обрезаем до целевой длительности (зацикленное видео)
      // Это гарантирует что финальное видео будет нужной длины
      if (targetDuration > 0) {
        outputOpts.push("-t", targetDuration.toString());
        console.log(`Output will be trimmed to ${targetDuration} seconds`);
      } else {
        // Fallback: используем -shortest если не удалось получить длительность
        outputOpts.push("-shortest");
      }
      
      // Добавляем фильтр в зависимости от метода
      if (emojiExists) {
        // Используем complex filter для наложения изображения
        // Сначала указываем filter_complex, потом мапим выходные потоки
        
        // Если есть аудио, добавляем его обработку в фильтр
        if (hasAudioFile) {
          let audioFilter: string;
          // Если видео длиннее аудио, зацикливаем аудио
          if (targetDuration > 0 && audioDuration > 0 && targetDuration > audioDuration) {
            // Вычисляем количество циклов (округление вверх)
            const loops = Math.ceil(targetDuration / audioDuration);
            console.log(`Audio needs ${loops} loops to match video duration (${targetDuration}s)`);
            // Используем loop с конкретным количеством циклов
            audioFilter = `[${audioInputIndex}:a]aloop=loop=${loops}:size=2e+09,asetpts=N/SR/TB[audio]`;
          } else {
            // Если аудио длиннее видео, обрезаем аудио до длительности видео
            // Это гарантирует что аудио будет точно соответствовать видео
            if (targetDuration > 0) {
              audioFilter = `[${audioInputIndex}:a]atrim=0:${targetDuration},asetpts=PTS-STARTPTS[audio]`;
              console.log(`Audio will be trimmed to ${targetDuration} seconds`);
            } else {
              audioFilter = `[${audioInputIndex}:a]asetpts=N/SR/TB[audio]`;
            }
          }
          filterComplex = `${filterComplex};${audioFilter}`;
          outputOpts.push("-filter_complex", filterComplex);
          outputOpts.push("-map", "[v]");
          outputOpts.push("-map", "[audio]");
        } else {
          outputOpts.push("-filter_complex", filterComplex);
          outputOpts.push("-map", "[v]");
          // Мапим аудио из первого входа (если есть)
          outputOpts.push("-map", "0:a?");
        }
      } else {
        // Используем обычный video filter для drawtext
        // При использовании -vf видео мапится автоматически, НЕ нужно указывать -map 0:v
        outputOpts.push("-vf", filterComplex);
        
        // Аудио
        if (hasAudioFile) {
          // Добавляем обработку аудио через complex filter
          let audioFilter: string;
          // Если видео длиннее аудио, зацикливаем аудио
          if (targetDuration > 0 && audioDuration > 0 && targetDuration > audioDuration) {
            const loops = Math.ceil(targetDuration / audioDuration);
            console.log(`Audio needs ${loops} loops to match video duration (${targetDuration}s)`);
            audioFilter = `[${audioInputIndex}:a]aloop=loop=${loops}:size=2e+09,asetpts=N/SR/TB[audio]`;
          } else {
            // Если аудио длиннее видео, обрезаем аудио до длительности видео
            if (targetDuration > 0) {
              audioFilter = `[${audioInputIndex}:a]atrim=0:${targetDuration},asetpts=PTS-STARTPTS[audio]`;
              console.log(`Audio will be trimmed to ${targetDuration} seconds`);
            } else {
              audioFilter = `[${audioInputIndex}:a]asetpts=N/SR/TB[audio]`;
            }
          }
          outputOpts.push("-filter_complex", audioFilter);
          outputOpts.push("-map", "[audio]");
        } else {
          // Аудио из исходного видео (если есть)
          outputOpts.push("-map", "0:a?");
        }
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
            if (tempAudioPath) {
              await fs.unlink(tempAudioPath).catch(() => {});
            }

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
          if (tempAudioPath) {
            fs.unlink(tempAudioPath).catch(() => {});
          }
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
    if (tempAudioPath) {
      await fs.unlink(tempAudioPath).catch(() => {});
    }
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