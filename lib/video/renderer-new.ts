import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as fsSync from "fs";
import ffmpeg from "fluent-ffmpeg";
import { uploadVideoToSpaces, isSpacesConfigured } from "@/lib/storage/spaces-client";

const execAsync = promisify(exec);

/**
 * Выполняет команду с правильными переменными окружения для FFmpeg
 * Устанавливает LD_LIBRARY_PATH для загрузки библиотек FFmpeg
 */
async function execWithFFmpegEnv(command: string): Promise<{ stdout: string; stderr: string }> {
  // Пути к библиотекам FFmpeg в DigitalOcean APT buildpack
  // Добавляем все возможные пути, где могут быть библиотеки
  const basePaths = [
    "/layers/digitalocean_apt/apt",
    "/app/.apt",
  ];
  
  const libraryPaths: string[] = [];
  
  for (const basePath of basePaths) {
    // Стандартные пути к библиотекам
    const paths = [
      `${basePath}/usr/lib/x86_64-linux-gnu`,
      `${basePath}/usr/lib`,
      `${basePath}/lib/x86_64-linux-gnu`,
      `${basePath}/lib`,
      // PulseAudio может быть в поддиректории
      `${basePath}/usr/lib/x86_64-linux-gnu/pulseaudio`,
      `${basePath}/usr/lib/pulseaudio`,
      `${basePath}/lib/x86_64-linux-gnu/pulseaudio`,
      `${basePath}/lib/pulseaudio`,
      // BLAS и LAPACK могут быть в поддиректориях
      `${basePath}/usr/lib/x86_64-linux-gnu/blas`,
      `${basePath}/usr/lib/x86_64-linux-gnu/lapack`,
      `${basePath}/usr/lib/blas`,
      `${basePath}/usr/lib/lapack`,
    ];
    
    for (const p of paths) {
      try {
        if (fsSync.existsSync(p)) {
          libraryPaths.push(p);
        }
      } catch {
        // Игнорируем ошибки
      }
    }
  }
  
  // Убираем дубликаты и сортируем для консистентности
  const uniquePaths = [...new Set(libraryPaths)].sort();

  const currentLdLibraryPath = process.env.LD_LIBRARY_PATH || "";
  // Добавляем системные пути в конец
  const systemPaths = [
    "/usr/lib/x86_64-linux-gnu",
    "/usr/lib",
    "/lib/x86_64-linux-gnu",
    "/lib",
  ];
  
  const newLdLibraryPath = [...uniquePaths, ...systemPaths, currentLdLibraryPath]
    .filter(Boolean)
    .filter((p, i, arr) => arr.indexOf(p) === i) // Убираем дубликаты
    .join(":");
  
  console.log("🔍 LD_LIBRARY_PATH configured:", newLdLibraryPath);

  const env = {
    ...process.env,
    LD_LIBRARY_PATH: newLdLibraryPath,
    PATH: process.env.PATH || "",
  };

  return new Promise((resolve, reject) => {
    exec(command, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Новый рендерер для конструктора видео
 * Позволяет создавать видео с кастомным расположением элементов
 */

export interface TextElement {
  text: string;
  x: number; // Позиция в пикселях (0-720)
  y: number; // Позиция в пикселях (0-1280)
  fontSize: number;
  color: string; // Формат: black@1 или white@0.8
  backgroundColor?: string; // Формат: white@0.6
  boxPadding?: number;
  fontWeight?: "normal" | "bold"; // Жирность шрифта
  width?: number; // Максимальная ширина текстового блока
}

export interface EmojiElement {
  emoji: string;
  x: number; // Позиция в пикселях (0-720)
  y: number; // Позиция в пикселях (0-1280)
  size: number; // Размер в пикселях
  animation?: "none" | "pulse" | "rotate" | "bounce" | "fade";
}

export interface RenderVideoNewOptions {
  backgroundVideoUrl?: string; // URL или путь к видео-фону
  backgroundImageUrl?: string; // URL или путь к изображению-фону (альтернатива видео)
  textElements: TextElement[];
  emojiElements: EmojiElement[];
  audioUrl?: string; // URL аудио для наложения
  duration?: number; // Длительность видео в секундах (по умолчанию 10)
  jobId: string;
}

export interface RenderVideoNewResult {
  videoUrl: string;
  filePath: string;
  duration: number;
}

/**
 * Создает выражение анимации для эмодзи
 */
function createEmojiAnimationExpression(
  animationType: EmojiElement["animation"],
  baseValue: number,
  param: "x" | "y" | "scale" = "scale"
): string {
  if (animationType === "none" || !animationType) {
    return baseValue.toString();
  }

  switch (animationType) {
    case "pulse": {
      if (param === "scale") {
        return `${baseValue}*(0.9+0.1*sin(2*PI*t/1.5))`;
      }
      return baseValue.toString();
    }

    case "rotate": {
      if (param === "x") {
        const offset = 10;
        return `${baseValue}+${offset}*sin(2*PI*t/2)`;
      }
      if (param === "y") {
        const offset = 10;
        return `${baseValue}+${offset}*cos(2*PI*t/2)`;
      }
      return baseValue.toString();
    }

    case "bounce": {
      if (param === "y") {
        const bounceHeight = 15;
        return `${baseValue}-${bounceHeight}*abs(sin(2*PI*t/1.2))`;
      }
      return baseValue.toString();
    }

    case "fade": {
      return baseValue.toString();
    }

    default:
      return baseValue.toString();
  }
}

/**
 * Проверяет наличие FFmpeg в системе (неблокирующая проверка)
 * Просто логирует информацию, но не прерывает выполнение
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  // Просто пытаемся выполнить ffmpeg -version для логирования
  // Если не получится, ошибка будет видна в логах FFmpeg при выполнении команды
  try {
    const { stdout } = await execWithFFmpegEnv("ffmpeg -version 2>&1");
    const versionLine = stdout.split('\n')[0];
    console.log("✅ FFmpeg found:", versionLine);
    
    // Проверяем, является ли это статической сборкой
    if (versionLine.includes('static') || versionLine.includes('johnvansickle')) {
      console.log("⚠️  Static FFmpeg build detected - some filters may not be available");
    } else {
      console.log("✅ Full FFmpeg version detected");
    }
    
    return true;
  } catch (error) {
    // Не блокируем выполнение - ошибка будет видна при выполнении команды FFmpeg
    console.log("⚠️  FFmpeg check failed, but continuing anyway. Error will be visible in FFmpeg command logs.");
    return true; // Возвращаем true, чтобы не блокировать выполнение
  }
}

/**
 * Получает длительность медиа файла в секундах
 */
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    // Пробуем найти недостающие библиотеки через find и ldconfig
    try {
      // Сначала пробуем обновить кэш библиотек через ldconfig (если доступен)
      try {
        await execAsync("ldconfig 2>/dev/null || true");
      } catch {
        // Игнорируем ошибки ldconfig
      }

      const missingLibs = ['libblas.so.3', 'libblas.so', 'liblapack.so.3', 'liblapack.so', 'libpulsecommon-15.99.so', 'libvpx.so.7'];
      const searchPaths = [
        '/layers/digitalocean_apt/apt',
        '/app/.apt',
        '/usr/lib',
        '/lib',
        '/usr/lib/x86_64-linux-gnu',
        '/lib/x86_64-linux-gnu',
        // Специальные поддиректории для BLAS/LAPACK
        '/layers/digitalocean_apt/apt/usr/lib/x86_64-linux-gnu/blas',
        '/layers/digitalocean_apt/apt/usr/lib/x86_64-linux-gnu/lapack',
        '/app/.apt/usr/lib/x86_64-linux-gnu/blas',
        '/app/.apt/usr/lib/x86_64-linux-gnu/lapack',
      ];
      
      for (const libName of missingLibs) {
        // Ищем библиотеку во всех возможных местах
        const searchCmd = `find ${searchPaths.join(' ')} -name '${libName}*' -type f 2>/dev/null | head -1 || echo ''`;
        const { stdout: libPath } = await execAsync(searchCmd);
        const foundLibPath = libPath.trim();
        
        if (foundLibPath) {
          const libDir = path.dirname(foundLibPath);
          console.log(`🔍 Found ${libName} at: ${foundLibPath}, adding ${libDir} to LD_LIBRARY_PATH`);
          const currentLdPath = process.env.LD_LIBRARY_PATH || "";
          if (!currentLdPath.includes(libDir)) {
            process.env.LD_LIBRARY_PATH = `${libDir}:${currentLdPath}`;
          }
        } else {
          // Пробуем найти через ldconfig -p
          try {
            const { stdout: ldconfigOutput } = await execAsync("ldconfig -p 2>/dev/null | grep " + libName + " || echo ''");
            if (ldconfigOutput.trim()) {
              console.log(`🔍 Found ${libName} via ldconfig: ${ldconfigOutput.trim()}`);
            }
          } catch {
            // Игнорируем ошибки
          }
        }
      }
    } catch (e) {
      // Игнорируем ошибки поиска
      console.log("🔍 Library search failed:", e);
    }

    const { stdout } = await execWithFFmpegEnv(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch (error) {
    console.error("Failed to get media duration:", error);
    return 0;
  }
}

/**
 * Создает изображение эмодзи используя Twemoji API
 */
async function createEmojiImage(emoji: string, outputPath: string): Promise<void> {
  const codePoints: string[] = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp) {
      codePoints.push(cp.toString(16));
    }
  }
  const emojiCode = codePoints.join('-');
  const twemojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${emojiCode}.png`;

  console.log(`Downloading emoji from Twemoji: ${twemojiUrl}`);

  try {
    const response = await fetch(twemojiUrl);
    if (!response.ok) {
      throw new Error(`Failed to download emoji: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
    console.log(`Emoji image downloaded: ${outputPath}`);
  } catch (error) {
    console.error(`Failed to download emoji from Twemoji:`, error);
    throw error;
  }
}

/**
 * Рендерит видео с кастомным расположением элементов
 */
export async function renderVideoNew(
  options: RenderVideoNewOptions
): Promise<RenderVideoNewResult> {
  const {
    backgroundVideoUrl,
    backgroundImageUrl,
    textElements,
    emojiElements,
    audioUrl,
    duration = 10,
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

  // Определяем директорию для видео
  // В production используем /tmp для временных файлов
  // В development используем public/videos для удобства разработки
  const isProduction = process.env.NODE_ENV === 'production';
  const videosDir = isProduction
    ? path.join('/tmp', 'videos')
    : path.join(process.cwd(), "public", "videos");

  await fs.mkdir(videosDir, { recursive: true });

  // Пути для временных файлов
  const tempBackgroundPath = path.join(videosDir, `temp_bg_${jobId}.mp4`);
  const tempAudioPath = audioUrl ? path.join(videosDir, `temp_audio_${jobId}.mp3`) : null;
  const outputVideoPath = path.join(videosDir, `final_${jobId}.mp4`);

  // В production видео будет загружено в cloud storage (S3/Spaces)
  // Пока временно возвращаем локальный путь (потом заменим на S3 URL)
  const outputVideoUrl = isProduction
    ? `/videos/final_${jobId}.mp4` // Временно, потом заменим на S3 URL
    : `/videos/final_${jobId}.mp4`;

  // Массив для хранения путей к изображениям эмодзи
  const emojiImagePaths: string[] = [];

  try {
    // 1. Скачиваем или подготавливаем фон
    let isVideoBackground = false;

    if (backgroundVideoUrl) {
      console.log("Downloading background video:", backgroundVideoUrl);
      const response = await fetch(backgroundVideoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download background video: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(tempBackgroundPath, buffer);
      console.log("Background video downloaded");
      isVideoBackground = true;
    } else if (backgroundImageUrl) {
      console.log("Downloading background image:", backgroundImageUrl);
      const response = await fetch(backgroundImageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download background image: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(tempBackgroundPath, buffer);
      console.log("Background image downloaded");
      isVideoBackground = false;
    } else {
      throw new Error("Either backgroundVideoUrl or backgroundImageUrl must be provided");
    }

    // 2. Скачиваем аудио, если предоставлено
    if (audioUrl && tempAudioPath) {
      console.log("Downloading audio:", audioUrl);
      try {
        const audioResponse = await fetch(audioUrl);
        if (audioResponse.ok) {
          const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
          await fs.writeFile(tempAudioPath, audioBuffer);
          console.log("Audio downloaded successfully");
        } else {
          console.warn("Failed to download audio, continuing without audio");
        }
      } catch (audioError) {
        console.warn("Failed to download audio, continuing without audio:", audioError);
      }
    }

    // 3. Скачиваем изображения эмодзи
    for (let i = 0; i < emojiElements.length; i++) {
      const emojiPath = path.join(videosDir, `emoji_${jobId}_${i}.png`);
      emojiImagePaths.push(emojiPath);
      try {
        await createEmojiImage(emojiElements[i].emoji, emojiPath);
      } catch (error) {
        console.warn(`Failed to create emoji image ${i}, will skip:`, error);
      }
    }

    // 4. Получаем длительность фона
    let backgroundDuration = 0;
    let audioDuration = 0;

    try {
      backgroundDuration = await getMediaDuration(tempBackgroundPath);
      console.log(`Background duration: ${backgroundDuration} seconds`);

      if (tempAudioPath) {
        const hasAudioFile = await fs.stat(tempAudioPath).then(() => true).catch(() => false);
        if (hasAudioFile) {
          audioDuration = await getMediaDuration(tempAudioPath);
          console.log(`Audio duration: ${audioDuration} seconds`);
        }
      }
    } catch (error) {
      console.warn("Failed to get media duration:", error);
      backgroundDuration = duration;
    }

    // 5. Создаем FFmpeg фильтры
    const targetDuration = duration;
    const videoLoops = isVideoBackground ? Math.ceil(targetDuration / backgroundDuration) - 1 : 0;

    return new Promise(async (resolve, reject) => {
      // Начинаем с базового фильтра для фона
      const filterChain: string[] = [];

      // Обработка фона
      if (isVideoBackground) {
        // Для видео используем scale и pad без фильтра loop (зацикливание через -stream_loop)
        filterChain.push(`[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black[base]`);
      } else {
        // Для изображения создаем видео нужной длительности без фильтра loop
        filterChain.push(`[0:v]fps=25,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black[base]`);
      }

      let currentLayer = "[base]";

      // Добавляем текстовые элементы
      const textFilePaths: string[] = [];
      for (let i = 0; i < textElements.length; i++) {
        const te = textElements[i];

        // В UI координаты x,y обозначают верхний левый угол контейнера (включая padding)
        // В FFmpeg drawtext координаты x,y обозначают позицию текста, а boxborderw рисует бокс вокруг текста
        // Поэтому нужно добавить padding к координатам, чтобы текст начинался с правильного места
        const boxPadding = te.boxPadding || 10;
        const textX = te.x + boxPadding;
        const textY = te.y + boxPadding;

        // Функция для переноса текста по ширине
        // Оцениваем количество символов на строку на основе ширины и размера шрифта
        const wrapText = (text: string, textWidth?: number): string => {
          // Оцениваем количество символов на строку
          // Примерно 0.6 * fontSize пикселей на символ для Arial
          const availableWidth = textWidth || (720 - textX - boxPadding * 2); // Используем доступную ширину
          const estimatedCharsPerLine = Math.floor(availableWidth / (te.fontSize * 0.6));
          const maxCharsPerLine = Math.max(20, Math.min(40, estimatedCharsPerLine));
          
          const words = text.split(/\s+/);
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

        // Обрабатываем текст: сохраняем существующие переносы строк из textarea
        let processedText = te.text
          .replace(/\r\n/g, '\n')  // Нормализуем Windows переносы
          .replace(/\r/g, '\n');   // Нормализуем старые Mac переносы

        // Проверяем, есть ли в тексте явные переносы строк (пользователь нажал Enter)
        const hasExplicitLineBreaks = processedText.includes('\n');
        
        if (hasExplicitLineBreaks) {
          // Если пользователь сам указал переносы строк - сохраняем их ТОЧНО как есть
          // Только убираем лишние пробелы в начале/конце каждой строки (но сохраняем пустые строки)
          const lines = processedText.split('\n');
          processedText = lines.map(line => line.trim()).join('\n');
          // Сохраняем пустые строки (двойные переносы) - они могут быть важны для форматирования
        } else {
          // Если пользователь не указал переносы строк - применяем автоматический перенос по ширине
          if (te.width) {
            processedText = wrapText(processedText, te.width);
          } else {
            processedText = wrapText(processedText);
          }
        }

        // Создаем временный файл для текста (как в старом рендерере)
        // Это более надежный способ для многострочного текста
        const textFilePath = path.join(videosDir, `text_${jobId}_${i}.txt`);
        await fs.writeFile(textFilePath, processedText, 'utf-8');
        textFilePaths.push(textFilePath);

        // Используем textfile вместо text для поддержки многострочного текста
        // Экранируем путь к файлу для использования в filter_complex
        const escapedFilePath = textFilePath
          .replace(/\\/g, '\\\\')   // \ -> \\
          .replace(/:/g, '\\:')      // : -> \:
          .replace(/\[/g, '\\[')     // [ -> \[
          .replace(/\]/g, '\\]')     // ] -> \]
          .replace(/,/g, '\\,')      // , -> \,
          .replace(/;/g, '\\;');     // ; -> \;

        let drawtextFilter = `drawtext=textfile='${escapedFilePath}':fontcolor=${te.color}:fontsize=${te.fontSize}:x=${textX}:y=${textY}`;

        // Добавляем жирный шрифт если указано
        if (te.fontWeight === "bold") {
          drawtextFilter += `:font=Arial-Bold`;
        }

        if (te.backgroundColor) {
          drawtextFilter += `:box=1:boxcolor=${te.backgroundColor}:boxborderw=${boxPadding}`;
        }

        // Добавляем межстрочный интервал для лучшей читаемости
        const lineSpacing = Math.floor(te.fontSize * 0.3); // ~30% от размера шрифта
        drawtextFilter += `:line_spacing=${lineSpacing}`;

        if (te.width) {
          drawtextFilter += `:text_w=${te.width}`;
        }

        const nextLayer = `[text${i}]`;
        filterChain.push(`${currentLayer}${drawtextFilter}${nextLayer}`);
        currentLayer = nextLayer;
      }

      // Добавляем эмодзи
      let inputIndex = 1; // 0 - background, 1+ - эмодзи
      for (let i = 0; i < emojiElements.length; i++) {
        const ee = emojiElements[i];
        const emojiPath = emojiImagePaths[i];

        // Проверяем существование файла эмодзи
        const emojiExists = fs.stat(emojiPath).then(() => true).catch(() => false);
        if (!emojiExists) {
          console.warn(`Emoji ${i} file not found, skipping`);
          continue;
        }

        // Создаем фильтр для эмодзи
        const emojiLayer = `[emoji${i}]`;
        let emojiFilter = `[${inputIndex}:v]fps=25,scale=${ee.size}:${ee.size}`;

        // Добавляем анимацию fade
        if (ee.animation === "fade") {
          emojiFilter += `,format=rgba,colorchannelmixer=aa='if(lt(t,0.5),t*2,1)'`;
        }

        emojiFilter += emojiLayer;
        filterChain.push(emojiFilter);

        // Применяем анимацию к координатам
        const animatedX = createEmojiAnimationExpression(ee.animation, ee.x, "x");
        const animatedY = createEmojiAnimationExpression(ee.animation, ee.y, "y");

        // Создаем overlay
        const needsQuotes = ee.animation !== "none" && (animatedX.includes("sin") || animatedX.includes("cos") || animatedX.includes("abs"));
        const xExpr = needsQuotes ? `'${animatedX}'` : animatedX;
        const yExpr = needsQuotes ? `'${animatedY}'` : animatedY;

        const overlayExpression = `${xExpr}:${yExpr}`;

        const nextLayer = `[v${i}]`;
        filterChain.push(`${currentLayer}${emojiLayer}overlay=${overlayExpression}${nextLayer}`);
        currentLayer = nextLayer;
        inputIndex++;
      }

      // Финальный выходной поток
      filterChain.push(`${currentLayer}trim=duration=${targetDuration}[v]`);

      const filterComplex = filterChain.join(";");
      console.log("Filter complex:", filterComplex);

      // Находим путь к FFmpeg
      let ffmpegPath = "ffmpeg";
      try {
        const { stdout: whichPath } = await execAsync("which ffmpeg 2>/dev/null");
        const foundPath = whichPath.trim();
        if (foundPath && foundPath.includes('ffmpeg')) {
          ffmpegPath = foundPath;
        }
      } catch (e) {
        // Используем стандартный путь
      }

      // Настраиваем переменные окружения для fluent-ffmpeg
      const basePaths = [
        "/layers/digitalocean_apt/apt",
        "/app/.apt",
      ];
      
      const libraryPaths: string[] = [];
      
      for (const basePath of basePaths) {
        const paths = [
          `${basePath}/usr/lib/x86_64-linux-gnu`,
          `${basePath}/usr/lib`,
          `${basePath}/lib/x86_64-linux-gnu`,
          `${basePath}/lib`,
          `${basePath}/usr/lib/x86_64-linux-gnu/pulseaudio`,
          `${basePath}/usr/lib/pulseaudio`,
          `${basePath}/lib/x86_64-linux-gnu/pulseaudio`,
          `${basePath}/lib/pulseaudio`,
          // BLAS и LAPACK могут быть в поддиректориях
          `${basePath}/usr/lib/x86_64-linux-gnu/blas`,
          `${basePath}/usr/lib/x86_64-linux-gnu/lapack`,
          `${basePath}/usr/lib/blas`,
          `${basePath}/usr/lib/lapack`,
        ];
        
        for (const p of paths) {
          try {
            if (fsSync.existsSync(p)) {
              libraryPaths.push(p);
            }
          } catch {
            // Игнорируем ошибки
          }
        }
      }
      
      const uniquePaths = [...new Set(libraryPaths)].sort();
      const currentLdLibraryPath = process.env.LD_LIBRARY_PATH || "";
      // Добавляем системные пути в конец
      const systemPaths = [
        "/usr/lib/x86_64-linux-gnu",
        "/usr/lib",
        "/lib/x86_64-linux-gnu",
        "/lib",
      ];
      
      const newLdLibraryPath = [...uniquePaths, ...systemPaths, currentLdLibraryPath]
        .filter(Boolean)
        .filter((p, i, arr) => arr.indexOf(p) === i) // Убираем дубликаты
        .join(":");
      
      console.log("🔍 LD_LIBRARY_PATH for FFmpeg:", newLdLibraryPath);

      // Создаем FFmpeg команду
      let command = ffmpeg(tempBackgroundPath);
      
      // Настраиваем путь к FFmpeg и переменные окружения
      if (ffmpegPath !== "ffmpeg") {
        command.setFfmpegPath(ffmpegPath);
      }
      
      // Настраиваем переменные окружения перед выполнением команды
      process.env.LD_LIBRARY_PATH = newLdLibraryPath;

      // Для видео используем -stream_loop для зацикливания вместо фильтра loop
      // Используем -1 для бесконечного зацикливания, потом обрежем через trim
      if (isVideoBackground) {
        command = command.inputOptions(["-stream_loop", "-1"]);
      } else {
        // Для изображения используем -loop 1 для создания видео из статического изображения
        command = command.inputOptions(["-loop", "1"]);
      }

      // Добавляем входы для эмодзи
      for (const emojiPath of emojiImagePaths) {
        command = command
          .input(emojiPath)
          .inputOptions(["-loop", "1", "-framerate", "25"]);
      }

      // Добавляем аудио
      const hasAudioFile = tempAudioPath && await fs.stat(tempAudioPath).then(() => true).catch(() => false);
      if (hasAudioFile && tempAudioPath) {
        command = command.input(tempAudioPath);
      }

      // Настраиваем опции вывода
      const outputOpts = [
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
      ];

      // Обработка аудио
      let fullFilterComplex: string;
      if (hasAudioFile && tempAudioPath) {
        const audioInputIndex = 1 + emojiElements.length; // После фона и всех эмодзи
        let audioFilter: string;

        if (targetDuration > audioDuration) {
          const loops = Math.ceil(targetDuration / audioDuration);
          audioFilter = `[${audioInputIndex}:a]aloop=${loops}:size=2e+09,asetpts=N/SR/TB[audio]`;
        } else {
          audioFilter = `[${audioInputIndex}:a]atrim=0:${targetDuration},asetpts=PTS-STARTPTS[audio]`;
        }

        // Объединяем видео и аудио фильтры
        fullFilterComplex = `${filterComplex};${audioFilter}`;
      } else {
        fullFilterComplex = filterComplex;
      }

      // Применяем filter complex через complexFilter с опцией map
      command = command
        .complexFilter(fullFilterComplex, hasAudioFile && tempAudioPath ? ["[v]", "[audio]"] : ["[v]"]);

      // Если нет аудио файла, добавляем опциональный маппинг аудио из входного файла
      if (!hasAudioFile || !tempAudioPath) {
        outputOpts.push("-map", "0:a?");
      }

      outputOpts.push("-t", targetDuration.toString());

      // Настраиваем переменные окружения для spawn процесса
      // fluent-ffmpeg использует spawn, который наследует process.env
      const originalLdLibraryPath = process.env.LD_LIBRARY_PATH;
      process.env.LD_LIBRARY_PATH = newLdLibraryPath;

      command
        .outputOptions(outputOpts)
        .output(outputVideoPath)
        .on("start", (commandLine) => {
          console.log("FFmpeg command:", commandLine);
          console.log("LD_LIBRARY_PATH:", process.env.LD_LIBRARY_PATH);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log("Rendering progress:", Math.round(progress.percent), "%");
          }
        })
        .on("end", async () => {
          // Восстанавливаем оригинальный LD_LIBRARY_PATH после завершения
          if (originalLdLibraryPath !== undefined) {
            process.env.LD_LIBRARY_PATH = originalLdLibraryPath;
          } else {
            delete process.env.LD_LIBRARY_PATH;
          }
          
          try {
            const finalDuration = await getMediaDuration(outputVideoPath);

            // Загружаем видео в DigitalOcean Spaces (если настроено)
            let finalVideoUrl = outputVideoUrl;

            if (isProduction && isSpacesConfigured()) {
              console.log("📤 Uploading video to DigitalOcean Spaces...");
              try {
                finalVideoUrl = await uploadVideoToSpaces({
                  filePath: outputVideoPath,
                  fileName: `videos/final_${jobId}.mp4`,
                  contentType: "video/mp4",
                  publicRead: true,
                });

                // После успешной загрузки в Spaces удаляем локальный файл
                await fs.unlink(outputVideoPath).catch(() => {});
                console.log("✅ Video uploaded to Spaces and local file removed");
              } catch (uploadError) {
                console.error("⚠️ Failed to upload to Spaces, keeping local file:", uploadError);
                // Если загрузка в Spaces не удалась, оставляем локальный файл
              }
            }

            // Удаляем временные файлы
            await fs.unlink(tempBackgroundPath).catch(() => {});
            if (tempAudioPath) {
              await fs.unlink(tempAudioPath).catch(() => {});
            }
            for (const emojiPath of emojiImagePaths) {
              await fs.unlink(emojiPath).catch(() => {});
            }
            for (const textPath of textFilePaths) {
              await fs.unlink(textPath).catch(() => {});
            }

            console.log("Video rendering completed:", finalVideoUrl);
            resolve({
              videoUrl: finalVideoUrl,
              filePath: outputVideoPath,
              duration: finalDuration,
            });
          } catch (error) {
            reject(error);
          }
        })
        .on("error", (error: Error) => {
          console.error("FFmpeg error:", error);
          // Очистка временных файлов
          fs.unlink(tempBackgroundPath).catch(() => {});
          if (tempAudioPath) {
            fs.unlink(tempAudioPath).catch(() => {});
          }
          for (const emojiPath of emojiImagePaths) {
            fs.unlink(emojiPath).catch(() => {});
          }
          for (const textPath of textFilePaths) {
            fs.unlink(textPath).catch(() => {});
          }
          reject(new Error(`FFmpeg error: ${error.message}`));
        })
        .run();
    });
  } catch (error) {
    // Очистка временных файлов в случае ошибки
    await fs.unlink(tempBackgroundPath).catch(() => {});
    if (tempAudioPath) {
      await fs.unlink(tempAudioPath).catch(() => {});
    }
    for (const emojiPath of emojiImagePaths) {
      await fs.unlink(emojiPath).catch(() => {});
    }
    // Очищаем текстовые файлы (если они были созданы)
    try {
      const files = await fs.readdir(videosDir);
      for (const file of files) {
        if (file.startsWith(`text_${jobId}_`) && file.endsWith('.txt')) {
          await fs.unlink(path.join(videosDir, file)).catch(() => {});
        }
      }
    } catch {}
    throw error;
  }
}
