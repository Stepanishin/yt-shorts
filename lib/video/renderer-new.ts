import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as fsSync from "fs";
import ffmpeg from "fluent-ffmpeg";
import { uploadVideoToSpaces, isSpacesConfigured } from "@/lib/storage/spaces-client";

const execAsync = promisify(exec);

const FONT_CANDIDATES: Record<"bold" | "normal", string[]> = {
  bold: [
    // macOS fonts
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    // Linux fonts
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  ],
  normal: [
    // macOS fonts
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    // Linux fonts
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  ],
};

const linuxFontCache: Record<"bold" | "normal", string | null | undefined> = {
  bold: undefined,
  normal: undefined,
};

function findLinuxFontFile(weight: "bold" | "normal"): string | null {
  const cached = linuxFontCache[weight];
  if (cached !== undefined) {
    return cached;
  }

  for (const candidate of FONT_CANDIDATES[weight]) {
    try {
      if (fsSync.existsSync(candidate)) {
        linuxFontCache[weight] = candidate;
        return candidate;
      }
    } catch {
      // ignore fs errors and try next candidate
    }
  }

  linuxFontCache[weight] = null;
  return null;
}

function escapeFilterPath(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/'/g, "\\'");
}

/**
 * Выполняет команду с правильными переменными окружения для FFmpeg
 * Устанавливает LD_LIBRARY_PATH для загрузки библиотек FFmpeg
 */
export async function execWithFFmpegEnv(command: string): Promise<{ stdout: string; stderr: string }> {
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

  // Добавляем системные пути в конец
  const systemPaths = [
    "/usr/lib/x86_64-linux-gnu",
    "/usr/lib",
    "/lib/x86_64-linux-gnu",
    "/lib",
  ];

  // Разбиваем существующий LD_LIBRARY_PATH на отдельные пути (не как одну строку)
  const currentLdPaths = (process.env.LD_LIBRARY_PATH || "").split(":").filter(Boolean);

  const newLdLibraryPath = [...uniquePaths, ...systemPaths, ...currentLdPaths]
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
  x: number; // Позиция в пикселях (0-720), или -1 для центрирования
  y: number; // Позиция в пикселях (0-1280), или -1 для центрирования
  fontSize: number;
  color: string; // Формат: black@1 или white@0.8
  backgroundColor?: string; // Формат: white@0.6
  boxPadding?: number;
  fontWeight?: "normal" | "bold"; // Жирность шрифта
  width?: number; // Максимальная ширина текстового блока
  lineSpacing?: number; // Межстрочный интервал
}

export interface EmojiElement {
  emoji: string;
  x: number; // Позиция в пикселях (0-720)
  y: number; // Позиция в пикселях (0-1280)
  size: number; // Размер в пикселях
  animation?: "none" | "pulse" | "rotate" | "bounce" | "fade";
}

export interface GifElement {
  url: string;
  x: number; // Позиция в пикселях (0-720)
  y: number; // Позиция в пикселях (0-1280)
  width: number; // Ширина в пикселях
  height: number; // Высота в пикселях
}

export interface RenderVideoNewOptions {
  backgroundVideoUrl?: string; // URL или путь к видео-фону
  backgroundImageUrl?: string; // URL или путь к изображению-фону (альтернатива видео)
  imageEffect?: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left"; // Ken Burns эффект для изображения
  videoTrimStart?: number; // Начало обрезки видео в секундах
  videoTrimEnd?: number; // Конец обрезки видео в секундах
  textElements: TextElement[];
  emojiElements: EmojiElement[];
  gifElements?: GifElement[]; // GIF элементы
  audioUrl?: string; // URL аудио для наложения
  audioTrimStart?: number; // Начало обрезки аудио в секундах
  audioTrimEnd?: number; // Конец обрезки аудио в секундах
  duration?: number; // Длительность видео в секундах (по умолчанию 10)
  fitImageToFrame?: boolean; // Если true, изображение вписывается полностью с черными полосами (для мемов)
  jobId: string;
}

export interface RenderVideoNewResult {
  videoUrl: string;
  filePath: string;
  duration: number;
}

/**
 * Создает Ken Burns эффект для изображения
 * @param effect - тип эффекта
 * @param duration - длительность видео в секундах
 * @returns строка фильтра для FFmpeg
 */
function createKenBurnsFilter(
  effect: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left" | undefined,
  duration: number
): string {
  if (!effect || effect === "none") {
    return "";
  }

  // Базовые параметры для Ken Burns эффекта
  // zoompan фильтр: z - zoom, x/y - позиция, d - длительность в кадрах, s - размер выходного кадра
  const fps = 25;
  const totalFrames = duration * fps;
  const halfFrames = totalFrames / 2;

  switch (effect) {
    case "zoom-in":
      // Плавное приближение от 1.0x до 1.3x
      return `zoompan=z='min(zoom+0.0015,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=${fps}`;

    case "zoom-in-out":
      // Приближение первую половину, отдаление вторую половину (эффект дыхания)
      // Используем синусоидальную функцию для плавного перехода
      return `zoompan=z='1.15+0.15*sin(2*PI*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=${fps}`;

    case "pan-right-left":
      // Панорама вправо первую половину, влево вторую половину
      // Используем синусоидальную функцию для плавного движения туда-обратно
      return `zoompan=z='1.2':x='iw/2-(iw/zoom/2)+80*sin(2*PI*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=${fps}`;

    default:
      return "";
  }
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
 * Добавлен fallback для эмодзи с вариантными селекторами
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

  // Список URL для попыток (с fallback без вариантного селектора)
  const urlsToTry: string[] = [
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${emojiCode}.png`,
  ];

  // Если код содержит вариантный селектор (fe0f), добавляем вариант без него
  if (emojiCode.includes('-fe0f')) {
    const codeWithoutVariant = emojiCode.replace(/-fe0f/g, '');
    urlsToTry.push(`https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codeWithoutVariant}.png`);
  }

  console.log(`Downloading emoji, trying ${urlsToTry.length} URL(s): ${emoji}`);

  let lastError: Error | null = null;

  for (const twemojiUrl of urlsToTry) {
    try {
      console.log(`Trying: ${twemojiUrl}`);
      const response = await fetch(twemojiUrl);

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(outputPath, buffer);
        console.log(`✅ Emoji image downloaded: ${outputPath}`);
        return; // Успешно скачали
      } else {
        console.log(`❌ Failed with status ${response.status}, trying next URL...`);
        lastError = new Error(`Failed to download emoji: ${response.statusText}`);
      }
    } catch (error) {
      console.log(`❌ Error downloading from ${twemojiUrl}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  // Если все попытки не удались
  console.error(`Failed to download emoji after ${urlsToTry.length} attempts`);
  throw lastError || new Error('Failed to download emoji from all sources');
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
    imageEffect,
    videoTrimStart,
    videoTrimEnd,
    textElements,
    emojiElements,
    gifElements = [],
    audioUrl,
    audioTrimStart,
    audioTrimEnd,
    duration = 10,
    fitImageToFrame = false,
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

  // Массив для хранения путей к изображениям эмодзи и GIF
  const emojiImagePaths: string[] = [];
  const gifFilePaths: string[] = [];

  try {
    // 1. Скачиваем или подготавливаем фон
    let isVideoBackground = false;

    if (backgroundVideoUrl) {
      // Check if it's a local file path or a URL
      const isLocalFile = backgroundVideoUrl.startsWith('/') || backgroundVideoUrl.startsWith('./') || backgroundVideoUrl.match(/^[a-zA-Z]:\\/);

      if (isLocalFile) {
        console.log("Using local background video:", backgroundVideoUrl);
        // Copy local file to temp path
        await fs.copyFile(backgroundVideoUrl, tempBackgroundPath);
        console.log("Background video copied from local file");
      } else {
        console.log("Downloading background video:", backgroundVideoUrl);
        const response = await fetch(backgroundVideoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download background video: ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(tempBackgroundPath, buffer);
        console.log("Background video downloaded");
      }
      isVideoBackground = true;
    } else if (backgroundImageUrl) {
      // Check if it's a local file path or a URL
      const isLocalFile = backgroundImageUrl.startsWith('/') || backgroundImageUrl.startsWith('./') || backgroundImageUrl.match(/^[a-zA-Z]:\\/);

      if (isLocalFile) {
        console.log("Using local background image:", backgroundImageUrl);
        // Copy local file to temp path
        await fs.copyFile(backgroundImageUrl, tempBackgroundPath);
        console.log("Background image copied from local file");
      } else {
        console.log("Downloading background image:", backgroundImageUrl);
        const response = await fetch(backgroundImageUrl);
        if (!response.ok) {
          throw new Error(`Failed to download background image: ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(tempBackgroundPath, buffer);
        console.log("Background image downloaded");
      }
      isVideoBackground = false;
    } else {
      throw new Error("Either backgroundVideoUrl or backgroundImageUrl must be provided");
    }

    // 2. Скачиваем аудио, если предоставлено
    if (audioUrl && tempAudioPath) {
      // Check if it's a local file path or a URL
      const isLocalAudio = audioUrl.startsWith('/') || audioUrl.startsWith('./') || audioUrl.match(/^[a-zA-Z]:\\/);

      if (isLocalAudio) {
        console.log("Using local audio file:", audioUrl);
        try {
          await fs.copyFile(audioUrl, tempAudioPath);
          console.log("Audio copied from local file");
        } catch (audioError) {
          console.warn("Failed to copy local audio file, continuing without audio:", audioError);
        }
      } else {
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

    // 3.5. Скачиваем GIF файлы
    for (let i = 0; i < gifElements.length; i++) {
      const gif = gifElements[i];

      // Detect file extension from URL
      const urlExt = gif.url.toLowerCase().endsWith('.png') ? '.png' : '.gif';
      const gifPath = path.join(videosDir, `gif_${jobId}_${i}${urlExt}`);
      gifFilePaths.push(gifPath);

      try {
        console.log(`Downloading GIF ${i} from:`, gif.url);

        // Check if it's a local file path
        const isLocalFile = gif.url.startsWith('/') || gif.url.startsWith('./') || gif.url.match(/^[a-zA-Z]:\\/);

        if (isLocalFile) {
          console.log(`Using local GIF file: ${gif.url}`);
          // Copy local file instead of downloading
          await fs.copyFile(gif.url, gifPath);
          console.log(`GIF ${i} copied from local file`);
        } else {
          const response = await fetch(gif.url);
          if (response.ok) {
            const gifBuffer = await response.arrayBuffer();
            await fs.writeFile(gifPath, Buffer.from(gifBuffer));
            console.log(`GIF ${i} downloaded successfully`);
          } else {
            console.warn(`Failed to download GIF ${i}, status:`, response.status);
          }
        }
      } catch (error) {
        console.warn(`Failed to download GIF ${i}, will skip:`, error);
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

    return new Promise(async (resolve, reject) => {
      // Начинаем с базового фильтра для фона
      const filterChain: string[] = [];

      // Обработка фона
      if (isVideoBackground) {
        // Для видео: масштабируем до заполнения всего кадра (increase) + обрезаем лишнее (crop)
        // Это предотвращает черные полосы и обрезку сверху/снизу
        filterChain.push(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[base]`);
      } else {
        // Для изображения создаем видео нужной длительности с Ken Burns эффектом
        const kenBurnsFilter = createKenBurnsFilter(imageEffect, targetDuration);

        if (kenBurnsFilter) {
          // Если есть Ken Burns эффект, применяем zoompan который уже включает fps и scale
          if (fitImageToFrame) {
            // Для мемов: вписываем изображение полностью с черными полосами
            filterChain.push(`[0:v]scale=1440:2560:force_original_aspect_ratio=decrease,pad=1440:2560:(ow-iw)/2:(oh-ih)/2,${kenBurnsFilter}[base]`);
          } else {
            // Для обычных фонов: масштабируем с сохранением соотношения
            filterChain.push(`[0:v]scale=1440:2560:force_original_aspect_ratio=decrease,${kenBurnsFilter}[base]`);
          }
        } else {
          // Без эффекта - просто статичное изображение
          if (fitImageToFrame) {
            // Для мемов: вписываем изображение полностью с черными полосами
            filterChain.push(`[0:v]fps=25,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2[base]`);
          } else {
            // Для обычных фонов: заполняем кадр с обрезкой
            filterChain.push(`[0:v]fps=25,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[base]`);
          }
        }
      }

      let currentLayer = "[base]";

      // Добавляем текстовые элементы
      const textFilePaths: string[] = [];
      for (let i = 0; i < textElements.length; i++) {
        let te = textElements[i];

        // ДИНАМИЧЕСКИЙ РАСЧЕТ FONTSIZE НА ОСНОВЕ ДЛИНЫ ТЕКСТА
        // Переопределяем fontSize из template, если текст длинный
        const calculateDynamicFontSize = (text: string, baseFontSize: number): { fontSize: number; maxCharsPerLine: number } => {
          const textLength = text.length;
          let fontSize = baseFontSize;
          let maxCharsPerLine = 32;

          // Если baseFontSize > 40, используем динамическое масштабирование
          if (baseFontSize >= 40) {
            // Для коротких текстов используем дефолтный размер (максимум 32px)
            fontSize = 32;
            maxCharsPerLine = 32;

            // Уменьшаем размер шрифта для длинных текстов
            if (textLength > 500) {
              fontSize = 26;
              maxCharsPerLine = 26;
            } else if (textLength > 400) {
              fontSize = 28;
              maxCharsPerLine = 28;
            } else if (textLength > 300) {
              fontSize = 30;
              maxCharsPerLine = 30;
            } else if (textLength > 200) {
              fontSize = 32;
              maxCharsPerLine = 31;
            }
          } else {
            // Если baseFontSize <= 40, используем его как есть
            fontSize = baseFontSize;
            // Вычисляем maxCharsPerLine пропорционально
            maxCharsPerLine = Math.floor(32 * (32 / Math.max(fontSize, 1)));
          }

          return { fontSize, maxCharsPerLine };
        };

        const { fontSize: dynamicFontSize, maxCharsPerLine: dynamicMaxChars } = calculateDynamicFontSize(te.text, te.fontSize);

        // Создаем модифицированный объект te с новым fontSize
        te = {
          ...te,
          fontSize: dynamicFontSize,
        };

        // Динамически уменьшаем boxPadding для меньших шрифтов
        let boxPadding = te.boxPadding || 10;
        if (dynamicFontSize <= 28) {
          boxPadding = Math.min(boxPadding, 15); // Максимум 15px для маленьких шрифтов
        }

        console.log(`Text element ${i}: original fontSize=${textElements[i].fontSize}, dynamic fontSize=${dynamicFontSize}, text length=${te.text.length}, maxChars=${dynamicMaxChars}, boxPadding=${boxPadding}`);

        // В UI координаты x,y обозначают верхний левый угол контейнера (включая padding)
        // В FFmpeg drawtext координаты x,y обозначают позицию текста, а boxborderw рисует бокс вокруг текста
        // Поэтому нужно добавить padding к координатам, чтобы текст начинался с правильного места

        // Поддержка центрирования: x=-1 или y=-1 означает центрирование
        const numericTextX = te.x === -1 ? 360 : te.x + boxPadding; // Числовое значение для вычислений
        const textX = te.x === -1 ? "(w-text_w)/2" : (te.x + boxPadding).toString(); // Строковое значение для FFmpeg
        const textY = te.y === -1 ? "(h-text_h)/2" : (te.y + boxPadding).toString();

        // Функция для переноса текста по ширине (грубое приближение браузерного wrap)
        const wrapText = (text: string, textWidth?: number): string => {
          const availableWidth = textWidth || (720 - numericTextX - boxPadding * 2);
          // Примерно 0.55 * fontSize пикселей на символ для Arial
          const estimatedCharsPerLine = Math.floor(availableWidth / (te.fontSize * 0.55));
          // Используем минимум между вычисленным и динамическим значением для безопасности
          const maxCharsPerLine = Math.max(15, Math.min(dynamicMaxChars, estimatedCharsPerLine));

          const wrapLine = (line: string) => {
            const words = line.split(/\s+/);
            const lines: string[] = [];
            let currentLine = '';

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              if (testLine.length <= maxCharsPerLine) {
                currentLine = testLine;
              } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
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

          return text
            .split(/\r?\n/)
            .map((line) => wrapLine(line))
            .join('\n');
        };

        // Обрабатываем текст: сохраняем только явные переносы строк (Enter), убираем автоматические
        const processedText = te.text
          .replace(/\r\n/g, '\n')  // Нормализуем Windows переносы
          .replace(/\r/g, '\n')    // Нормализуем старые Mac переносы
          .trim();                 // Убираем лишние пробелы по краям
        const wrappedText = wrapText(processedText, te.width || (720 - numericTextX - boxPadding * 2));

        // Создаем временный файл для текста (как в старом рендерере)
        // Это более надежный способ для многострочного текста
        const textFilePath = path.join(videosDir, `text_${jobId}_${i}.txt`);
        await fs.writeFile(textFilePath, wrappedText, 'utf-8');
        textFilePaths.push(textFilePath);

        // Используем textfile вместо text для поддержки многострочного текста
        // Экранируем путь к файлу для использования в filter_complex
        const escapedFilePath = escapeFilterPath(textFilePath);

        // По умолчанию используем жирный шрифт (если не указано normal)
        const fontWeight: "normal" | "bold" = te.fontWeight ?? "bold";

        // Используем fontfile для точного указания файла шрифта
        const isMac = process.platform === "darwin";

        let fontParam = "";
        if (fontWeight === "bold") {
          if (isMac) {
            fontParam = `:fontfile='/System/Library/Fonts/Supplemental/Arial Bold.ttf'`;
          } else {
            const linuxFontFile = findLinuxFontFile("bold");
            if (linuxFontFile) {
              const escapedFontPath = escapeFilterPath(linuxFontFile);
              fontParam = `:fontfile='${escapedFontPath}'`;
            } else {
              fontParam = `:font='Liberation Sans Bold'`;
            }
          }
        } else {
          if (isMac) {
            fontParam = `:fontfile='/System/Library/Fonts/Supplemental/Arial.ttf'`;
          } else {
            const linuxFontFile = findLinuxFontFile("normal");
            if (linuxFontFile) {
              const escapedFontPath = escapeFilterPath(linuxFontFile);
              fontParam = `:fontfile='${escapedFontPath}'`;
            } else {
              fontParam = `:font='Liberation Sans'`;
            }
          }
        }

        let drawtextFilter = `drawtext=textfile='${escapedFilePath}'${fontParam}:fontcolor=${te.color}:fontsize=${te.fontSize}:x=${textX}:y=${textY}`;

        if (te.backgroundColor) {
          drawtextFilter += `:box=1:boxcolor=${te.backgroundColor}:boxborderw=${boxPadding}`;
        }

        // Добавляем межстрочный интервал для соответствия UI (lineHeight: 1.2)
        // lineHeight 1.2 означает, что высота строки = fontSize * 1.2
        // line_spacing в FFmpeg - это дополнительное расстояние между строками
        // Поэтому: line_spacing = fontSize * (1.2 - 1) = fontSize * 0.2
        const lineSpacing = te.lineSpacing !== undefined ? te.lineSpacing : Math.floor(te.fontSize * 0.2);
        drawtextFilter += `:line_spacing=${lineSpacing}`;

        // НЕ используем text_w - переносы уже добавлены в текст на клиенте через Canvas API
        // Это обеспечивает точное совпадение с тем, что отображается в textarea

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
        try {
          await fs.stat(emojiPath);
        } catch {
          console.warn(`Emoji ${i} file not found at ${emojiPath}, skipping`);
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

      // Добавляем GIF элементы
      for (let i = 0; i < gifElements.length; i++) {
        const gif = gifElements[i];
        const gifPath = gifFilePaths[i];

        // Проверяем существование файла GIF
        try {
          await fs.stat(gifPath);
        } catch {
          console.warn(`GIF ${i} file not found at ${gifPath}, skipping`);
          continue;
        }

        // Создаем фильтр для GIF - масштабируем до нужного размера
        const gifLayer = `[gif${i}]`;

        // Check if it's a PNG file (static image) - need to add loop filter
        const isPng = gifPath.toLowerCase().endsWith('.png');

        let gifFilter: string;
        if (isPng) {
          // For PNG, add loop filter to repeat the static image
          gifFilter = `[${inputIndex}:v]loop=loop=-1:size=32767,scale=${gif.width}:${gif.height}${gifLayer}`;
        } else {
          // For GIF, just scale (already looped via input options)
          gifFilter = `[${inputIndex}:v]scale=${gif.width}:${gif.height}${gifLayer}`;
        }

        filterChain.push(gifFilter);

        // Создаем overlay на заданной позиции
        const nextLayer = `[vg${i}]`;
        filterChain.push(`${currentLayer}${gifLayer}overlay=${gif.x}:${gif.y}${nextLayer}`);
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
      // Добавляем системные пути в конец
      const systemPaths = [
        "/usr/lib/x86_64-linux-gnu",
        "/usr/lib",
        "/lib/x86_64-linux-gnu",
        "/lib",
      ];
      const currentLdPaths = (process.env.LD_LIBRARY_PATH || "").split(":").filter(Boolean);

      const newLdLibraryPath = [...uniquePaths, ...systemPaths, ...currentLdPaths]
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
        const inputOpts: string[] = [];

        // Если указана обрезка видео, применяем -ss (seek start)
        if (videoTrimStart !== undefined && videoTrimStart > 0) {
          inputOpts.push("-ss", videoTrimStart.toString());
          console.log(`Video trim start: ${videoTrimStart}s`);
        }

        // Если указан конец обрезки, вычисляем длительность
        if (videoTrimEnd !== undefined && videoTrimEnd !== null) {
          const trimDuration = Math.max(0.1, videoTrimEnd - (videoTrimStart || 0)); // Минимум 0.1 секунды
          inputOpts.push("-t", trimDuration.toString());
          console.log(`Video trim duration: ${trimDuration}s (${videoTrimStart || 0}s - ${videoTrimEnd}s)`);
        }

        // Добавляем зацикливание только если не указана обрезка, либо если обрезанное видео короче целевой длительности
        const trimmedDuration = videoTrimEnd !== undefined && videoTrimEnd !== null
          ? Math.max(0.1, videoTrimEnd - (videoTrimStart || 0))
          : backgroundDuration;

        if (trimmedDuration < targetDuration) {
          inputOpts.push("-stream_loop", "-1");
        }

        if (inputOpts.length > 0) {
          command = command.inputOptions(inputOpts);
        }
      } else {
        // Для изображения используем -loop 1 для создания видео из статического изображения
        command = command.inputOptions(["-loop", "1"]);
      }

      // Добавляем входы для эмодзи (только существующие файлы)
      for (const emojiPath of emojiImagePaths) {
        try {
          await fs.stat(emojiPath);
          command = command
            .input(emojiPath)
            .inputOptions(["-loop", "1", "-framerate", "25"]);
        } catch {
          console.warn(`Skipping emoji input ${emojiPath} - file not found`);
        }
      }

      // Добавляем GIF файлы как входы с зацикливанием
      for (const gifPath of gifFilePaths) {
        try {
          await fs.stat(gifPath);

          // Check if it's a GIF or PNG file
          const isGif = gifPath.toLowerCase().endsWith('.gif');

          if (isGif) {
            // For GIF files, add loop options
            command = command
              .input(gifPath)
              .inputOptions(["-stream_loop", "-1", "-ignore_loop", "0"]);
            console.log(`Added GIF input with loop: ${gifPath}`);
          } else {
            // For PNG/static images, just add as input without loop
            command = command.input(gifPath);
            console.log(`Added static image input: ${gifPath}`);
          }
        } catch {
          console.warn(`Skipping GIF input ${gifPath} - file not found`);
        }
      }

      // Добавляем аудио
      const hasAudioFile = tempAudioPath && await fs.stat(tempAudioPath).then(() => true).catch(() => false);
      if (hasAudioFile && tempAudioPath) {
        command = command.input(tempAudioPath);
      }

      // Настраиваем опции вывода

      const outputOpts = [
        "-c:v", "libx264",
        // В продакшене используем ultrafast для уменьшения потребления памяти
        // В разработке medium для лучшего качества
        "-preset","ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        // Ограничиваем количество потоков в продакшене для экономии памяти
        ...(["-threads", "2"]),
        "-c:a", "aac",
        "-b:a", "128k",
      ];

      // Обработка аудио
      let fullFilterComplex: string;
      if (hasAudioFile && tempAudioPath) {
        const audioInputIndex = 1 + emojiElements.length + gifElements.length; // После фона, эмодзи и GIF
        let audioFilter: string;

        // Определяем начало и конец обрезки аудио
        const trimStart = audioTrimStart || 0;
        const trimEnd = audioTrimEnd || audioDuration;
        const trimmedDuration = trimEnd - trimStart;

        console.log(`Audio trim: ${trimStart}s - ${trimEnd}s (duration: ${trimmedDuration}s)`);

        // Сначала обрезаем аудио согласно выбранному региону
        const trimFilter = `[${audioInputIndex}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS`;

        // Если обрезанное аудио короче целевой длительности - зацикливаем
        if (trimmedDuration < targetDuration) {
          const loops = Math.ceil(targetDuration / trimmedDuration);
          audioFilter = `${trimFilter},aloop=${loops}:size=2e+09,atrim=0:${targetDuration},asetpts=PTS-STARTPTS[audio]`;
        } else {
          // Если обрезанное аудио длиннее или равно - просто обрезаем до нужной длины
          audioFilter = `${trimFilter},atrim=0:${targetDuration},asetpts=PTS-STARTPTS[audio]`;
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

      // Логируем информацию о памяти перед запуском
      const memUsage = process.memoryUsage();
      console.log("🧠 Memory before FFmpeg:", {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      });

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
            for (const gifPath of gifFilePaths) {
              await fs.unlink(gifPath).catch(() => {});
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
          console.error("FFmpeg error stack:", error.stack);

          // Восстанавливаем оригинальный LD_LIBRARY_PATH
          if (originalLdLibraryPath !== undefined) {
            process.env.LD_LIBRARY_PATH = originalLdLibraryPath;
          } else {
            delete process.env.LD_LIBRARY_PATH;
          }

          // Очистка временных файлов
          fs.unlink(tempBackgroundPath).catch(() => {});
          if (tempAudioPath) {
            fs.unlink(tempAudioPath).catch(() => {});
          }
          for (const emojiPath of emojiImagePaths) {
            fs.unlink(emojiPath).catch(() => {});
          }
          for (const gifPath of gifFilePaths) {
            fs.unlink(gifPath).catch(() => {});
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
    for (const gifPath of gifFilePaths) {
      await fs.unlink(gifPath).catch(() => {});
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

// ============================================
// NEWS VIDEO RENDERING
// ============================================

export interface RenderNewsVideoOptions {
  celebrityImageUrl: string; // URL of celebrity photo
  shortHeadline: string; // Short headline (in rounded rectangle, max 2 lines)
  newsTitle: string; // News title (bold text)
  newsSummary: string; // News summary (regular text)
  audioUrl?: string; // Optional background music
  audioTrimStart?: number; // Audio trim start in seconds
  audioTrimEnd?: number; // Audio trim end in seconds
  duration?: number; // Video duration in seconds (default: 8)
  imageYOffset?: number; // Y offset for image centering (negative = show more top, e.g. -100 for portraits)
  templateId?: "template1" | "template2"; // Template 1 = gradient bg (default), Template 2 = red headline + yellow text box
  blackAndWhite?: boolean;
  jobId: string;
}

/**
 * Create a PNG with rounded rectangle, gradient background, and centered text
 * @param width - Rectangle width
 * @param height - Rectangle height
 * @param outputPath - Output PNG file path
 * @param text - Text to display inside the rectangle
 * @param cornerRadius - Corner radius in pixels
 */
async function createGradientRoundedRectangleWithText(
  width: number,
  height: number,
  outputPath: string,
  text: string,
  cornerRadius: number = 20
): Promise<void> {
  const { createCanvas } = await import('canvas');

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Create gradient (red to blue, matching the provided gradient image)
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#8B0000'); // Dark red
  gradient.addColorStop(0.5, '#1a1a4d'); // Dark blue-purple
  gradient.addColorStop(1, '#0066ff'); // Bright blue

  // Draw rounded rectangle
  ctx.beginPath();
  ctx.moveTo(cornerRadius, 0);
  ctx.lineTo(width - cornerRadius, 0);
  ctx.quadraticCurveTo(width, 0, width, cornerRadius);
  ctx.lineTo(width, height - cornerRadius);
  ctx.quadraticCurveTo(width, height, width - cornerRadius, height);
  ctx.lineTo(cornerRadius, height);
  ctx.quadraticCurveTo(0, height, 0, height - cornerRadius);
  ctx.lineTo(0, cornerRadius);
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw text centered in the rectangle
  ctx.fillStyle = 'white';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap text to fit within box
  const maxWidth = width - 40; // 20px padding on each side
  const lineHeight = 34;
  const MAX_LINES = 3;
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  // Limit to MAX_LINES, truncate last line with "..." if needed
  if (lines.length > MAX_LINES) {
    lines.splice(MAX_LINES);
    const last = lines[MAX_LINES - 1];
    lines[MAX_LINES - 1] = last.length > 3 ? last.slice(0, -3) + '...' : '...';
  }

  // Draw lines centered vertically
  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
  }

  // Save as PNG
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(outputPath, buffer);
}

/**
 * Create a PNG with solid red rounded rectangle and white text with black stroke outline
 * Used for Template 2 headline box
 */
async function createRedRoundedRectangleWithText(
  width: number,
  height: number,
  outputPath: string,
  text: string,
  cornerRadius: number = 20
): Promise<void> {
  const { createCanvas } = await import('canvas');

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw rounded rectangle with solid red background
  ctx.beginPath();
  ctx.moveTo(cornerRadius, 0);
  ctx.lineTo(width - cornerRadius, 0);
  ctx.quadraticCurveTo(width, 0, width, cornerRadius);
  ctx.lineTo(width, height - cornerRadius);
  ctx.quadraticCurveTo(width, height, width - cornerRadius, height);
  ctx.lineTo(cornerRadius, height);
  ctx.quadraticCurveTo(0, height, 0, height - cornerRadius);
  ctx.lineTo(0, cornerRadius);
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
  ctx.closePath();

  ctx.fillStyle = '#CC0000'; // Bold red
  ctx.fill();

  // Draw text: white fill with black stroke (outline)
  ctx.font = 'bold 32px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const maxWidth = width - 40;
  const lineHeight = 40;
  const MAX_LINES = 3;
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit to MAX_LINES, truncate last line with "..." if needed
  if (lines.length > MAX_LINES) {
    lines.splice(MAX_LINES);
    const last = lines[MAX_LINES - 1];
    lines[MAX_LINES - 1] = last.length > 3 ? last.slice(0, -3) + '...' : '...';
  }

  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    // Draw black stroke (outline) first
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeText(lines[i], width / 2, y);
    // Draw white fill on top
    ctx.fillStyle = 'white';
    ctx.fillText(lines[i], width / 2, y);
  }

  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(outputPath, buffer);
}

/**
 * Render news video with celebrity image on top 1/3 and text on bottom 2/3
 * Layout:
 * - Top 1/3 (0-427px): Celebrity image (cover-fit)
 * - Bottom 2/3 (427-1280px): White background with title (bold) and summary (regular)
 *
 * Now uses renderVideoNew for consistent rendering with jokes
 */
export async function renderNewsVideo(
  options: RenderNewsVideoOptions
): Promise<RenderVideoNewResult> {
  const {
    celebrityImageUrl,
    shortHeadline,
    newsTitle,
    newsSummary,
    audioUrl,
    audioTrimStart,
    audioTrimEnd,
    duration = 8,
    imageYOffset = 0,
    templateId = "template1",
    blackAndWhite = false,
    jobId
  } = options;

  // Validate inputs
  if (!celebrityImageUrl) {
    throw new Error("Celebrity image URL is required");
  }
  if (!newsTitle || newsTitle.trim().length === 0) {
    throw new Error("News title is required");
  }
  if (!newsSummary || newsSummary.trim().length === 0) {
    throw new Error("News summary is required");
  }

  console.log("Rendering news video using renderVideoNew...");
  console.log(`Title: ${newsTitle}`);
  console.log(`Summary: ${newsSummary.substring(0, 100)}...`);
  console.log(`Image: ${celebrityImageUrl}`);
  console.log(`Duration: ${duration}s`);

  // Create a white background image layer with stacked celebrity image
  // We'll use a custom filter approach with color source for white background

  // Download celebrity image temporarily to create composite
  const isProduction = process.env.NODE_ENV === 'production';
  const videosDir = isProduction
    ? path.join('/tmp', 'videos')
    : path.join(process.cwd(), "public", "videos");

  await fs.mkdir(videosDir, { recursive: true });

  // Use renderVideoNew with custom filter setup
  // We need to create a composite image: celebrity on top (720x427) + white background (720x853)

  const renderOptions: RenderVideoNewOptions = {
    // We'll use backgroundImageUrl but override with custom filter
    backgroundImageUrl: celebrityImageUrl,

    // No image effects for news
    imageEffect: "none",

    // Text element: sensationalized news text (bold, centered)
    // Text is generated by GPT to be ~540-660 chars for optimal fill
    textElements: [
      {
        text: newsTitle,
        x: -1, // Center horizontally
        y: 500, // Start position in gradient area (gradient area starts at y=426)
        fontSize: 26, // Smaller font for 540-660 char text
        color: "white",
        fontWeight: "bold",
        lineSpacing: 6,
        width: 680, // Max width with padding (720 - 40px padding)
      },
    ],

    // No emoji or GIF elements
    emojiElements: [],
    gifElements: [],

    // Audio
    audioUrl: audioUrl || undefined,
    audioTrimStart,
    audioTrimEnd,

    // Duration
    duration,

    // Job ID
    jobId,
  };

  // Call renderVideoNew which handles everything correctly
  // But we need to override the background filter to create our custom layout
  // For now, let's create a workaround by preparing a composite background image

  // Actually, the best approach is to use the existing filter_complex capability
  // Let's modify the render to inject our custom filter for the celebrity + white bg layout

  // Since renderVideoNew doesn't support our custom layout natively,
  // we'll create a temporary composite background image

  try {
    // Create headline box PNG with text inside (style depends on template)
    const headlineBoxPath = path.join(videosDir, `headline_box_${jobId}.png`);
    console.log(`Creating headline box with text (${templateId})...`);
    if (templateId === "template2") {
      await createRedRoundedRectangleWithText(600, 140, headlineBoxPath, shortHeadline, 15);
    } else {
      await createGradientRoundedRectangleWithText(600, 100, headlineBoxPath, shortHeadline, 15);
    }
    console.log("Headline box with text created");

    // Download celebrity image
    console.log("Downloading celebrity image:", celebrityImageUrl);
    const imageResponse = await fetch(celebrityImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download celebrity image: ${imageResponse.statusText}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const tempCelebrityPath = path.join(videosDir, `temp_celebrity_${jobId}.jpg`);
    await fs.writeFile(tempCelebrityPath, imageBuffer);
    console.log("Celebrity image downloaded");

    // Create composite background VIDEO with animated glow/shimmer effect
    // Celebrity image (top 720x426) + white background (bottom 720x854)
    // IMPORTANT: Both heights must be EVEN numbers for libx264 (426+854=1280)
    const compositeBackgroundPath = path.join(videosDir, `temp_composite_bg_${jobId}.mp4`);

    // CORRECT approach using eq filter with sine function for pulsing brightness
    // PLUS zoompan for zoom in/out effect
    // Based on FFmpeg documentation: eq=brightness='A*sin(2*PI*f*t)':eval=frame
    // Where A = amplitude (0.15 for subtle pulse), f = frequency (0.4 Hz = 2.5 sec cycle)
    // 2*PI = 6.283185307, 2*PI*0.4 = 2.513274123
    const totalFrames = duration * 25; // 25 fps
    const gradientBgPath = path.join(process.cwd(), 'public', 'gradient-bg.png');
    // Y offset for image centering (negative = show more top of image)
    const yOffsetExpr = imageYOffset !== 0 ? `${imageYOffset}` : '';
    const yExpr = imageYOffset !== 0
      ? `y='ih/2-(ih/zoom/2)${imageYOffset >= 0 ? '+' : ''}${imageYOffset}'`
      : `y='ih/2-(ih/zoom/2)'`;

    // Celebrity image animation (shared between templates)
    const saturationNews = blackAndWhite ? 0 : 1.15;
    const celebrityFilter =
      `[0:v]scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640,fps=25,` +
      `zoompan=z='1+0.1*sin(on/25*1.256637)':x='iw/2-(iw/zoom/2)':${yExpr}:d=${totalFrames}:s=720x426:fps=25,` +
      `eq=brightness='0.15*sin(2.513274*t)':eval=frame,` +
      `eq=saturation=${saturationNews}[celebrity]`;

    let filterComplex: string;
    let compositeCmd: string;

    // Both templates use the same gradient background with pan animation
    filterComplex =
      `${celebrityFilter};` +
      `[1:v]fps=25,scale=1440:854:force_original_aspect_ratio=increase,crop=1440:854,` +
      `crop=720:854:'360+360*sin(1.884955592*t)':0[bg_gradient];` +
      `[celebrity][bg_gradient]vstack`;

    compositeCmd = `ffmpeg -loop 1 -i "${tempCelebrityPath}" -loop 1 -i "${gradientBgPath}" -y -filter_complex "${filterComplex}" -t ${duration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${compositeBackgroundPath}"`;

    console.log(`Creating composite background video (${templateId})...`);
    await execWithFFmpegEnv(compositeCmd);
    console.log("Composite background video created");

    // Text elements differ by template
    const mainTextElement: TextElement = templateId === "template2"
      ? {
          text: newsTitle,
          x: -1,
          y: 500,
          fontSize: 24,
          color: "black@1",         // Black bold text
          fontWeight: "bold",
          lineSpacing: 6,
          width: 680,
          backgroundColor: "yellow@1",  // Yellow container
          boxPadding: 20,
        }
      : {
          text: newsTitle,
          x: -1,
          y: 500,
          fontSize: 24,
          color: "white",
          fontWeight: "bold",
          lineSpacing: 6,
          width: 680,
        };

    // Now use renderVideoNew with the composite background VIDEO
    const result = await renderVideoNew({
      ...renderOptions,
      backgroundVideoUrl: compositeBackgroundPath, // Use composite VIDEO instead of image
      backgroundImageUrl: undefined, // Clear image URL since we're using video

      // Layout: headline box (with text inside) overlaps boundary between photo (0-426px) and background (426-1280px)
      textElements: [mainTextElement],

      // Headline box with text already rendered inside (PNG image)
      // Positioned to overlap boundary between photo and background
      // Photo ends at y=426, box height=140, so to center on boundary: y = 426 - 70 = 356
      gifElements: [
        {
          url: headlineBoxPath,
          x: 60, // Center: (720 - 600) / 2 = 60
          y: 356, // Center box on photo/background boundary (426 - 70 = 356)
          width: 600,
          height: 140,
        },
        // Animated subscribe sticker with transparent background (GIPHY)
        {
          url: "https://media4.giphy.com/media/Ve5hR4qmFYrAKWQbj6/giphy.gif",
          x: 110, // Centered horizontally: (720 - 500) / 2 = 110
          y: 980, // Near bottom
          width: 500,
          height: 250,
        },
      ],

      // No emoji elements - using GIF animations instead
      emojiElements: [],
    });

    // Clean up temporary files
    await fs.unlink(tempCelebrityPath).catch(() => {});
    await fs.unlink(compositeBackgroundPath).catch(() => {});
    await fs.unlink(headlineBoxPath).catch(() => {});

    console.log("News video rendering completed:", result.videoUrl);
    return result;
  } catch (error) {
    console.error("Failed to render news video:", error);

    // Clean up temporary files on error
    const tempCelebrityPath = path.join(videosDir, `temp_celebrity_${jobId}.jpg`);
    const compositeBackgroundPath = path.join(videosDir, `temp_composite_bg_${jobId}.mp4`);
    const headlineBoxPath = path.join(videosDir, `headline_box_${jobId}.png`);
    await fs.unlink(tempCelebrityPath).catch(() => {});
    await fs.unlink(compositeBackgroundPath).catch(() => {});
    await fs.unlink(headlineBoxPath).catch(() => {});

    throw error;
  }
}

// ============================================
// CELEBRITY FACTS VIDEO RENDERING (2 photos)
// ============================================

export interface RenderCelebrityFactsVideoOptions {
  imageUrl1: string; // First celebrity photo URL
  imageUrl2: string; // Second celebrity photo URL
  shortHeadline: string; // Short headline in rounded rectangle
  factText: string; // Main text overlay
  audioUrl?: string;
  audioTrimStart?: number;
  audioTrimEnd?: number;
  duration?: number;
  templateId?: "template1" | "template2";
  blackAndWhite?: boolean;
  jobId: string;
}

/**
 * Render a celebrity facts video with TWO photos side by side in the top area.
 * Layout: top 426px split 50/50 between two photos; bottom 854px = gradient + text.
 */
export async function renderCelebrityFactsVideo(
  options: RenderCelebrityFactsVideoOptions
): Promise<RenderVideoNewResult> {
  const {
    imageUrl1,
    imageUrl2,
    shortHeadline,
    factText,
    audioUrl,
    audioTrimStart,
    audioTrimEnd,
    duration = 8,
    templateId = "template1",
    blackAndWhite = false,
    jobId,
  } = options;

  if (!imageUrl1 || !imageUrl2) throw new Error("Both celebrity image URLs are required");
  if (!factText?.trim()) throw new Error("Fact text is required");

  const isProduction = process.env.NODE_ENV === "production";
  const videosDir = isProduction
    ? path.join("/tmp", "videos")
    : path.join(process.cwd(), "public", "videos");

  await fs.mkdir(videosDir, { recursive: true });

  const tempImg1Path = path.join(videosDir, `temp_fact_img1_${jobId}.jpg`);
  const tempImg2Path = path.join(videosDir, `temp_fact_img2_${jobId}.jpg`);
  const compositeBackgroundPath = path.join(videosDir, `temp_fact_composite_${jobId}.mp4`);
  const headlineBoxPath = path.join(videosDir, `fact_headline_box_${jobId}.png`);

  try {
    // 1. Download both images and pre-crop to 360x426 (top-center) for correct face framing
    console.log(`[${jobId}] Downloading celebrity images for facts video...`);
    const tempImg1Raw = path.join(videosDir, `temp_fact_img1_raw_${jobId}.jpg`);
    const tempImg2Raw = path.join(videosDir, `temp_fact_img2_raw_${jobId}.jpg`);

    const [resp1, resp2] = await Promise.all([fetch(imageUrl1), fetch(imageUrl2)]);
    if (!resp1.ok) throw new Error(`Failed to download image 1: ${resp1.statusText}`);
    if (!resp2.ok) throw new Error(`Failed to download image 2: ${resp2.statusText}`);
    await fs.writeFile(tempImg1Raw, Buffer.from(await resp1.arrayBuffer()));
    await fs.writeFile(tempImg2Raw, Buffer.from(await resp2.arrayBuffer()));
    console.log(`[${jobId}] Both images downloaded, pre-cropping to 360x426...`);

    // Pre-crop: scale so smallest dimension covers 360x426, crop from top-center
    // This ensures faces (top of portrait photos) are not cut off
    const cropCmd1 = `ffmpeg -i "${tempImg1Raw}" -y -vf "scale=360:426:force_original_aspect_ratio=increase,crop=360:426:(iw-360)/2:0" "${tempImg1Path}"`;
    const cropCmd2 = `ffmpeg -i "${tempImg2Raw}" -y -vf "scale=360:426:force_original_aspect_ratio=increase,crop=360:426:(iw-360)/2:0" "${tempImg2Path}"`;
    await execWithFFmpegEnv(cropCmd1);
    await execWithFFmpegEnv(cropCmd2);
    await fs.unlink(tempImg1Raw).catch(() => {});
    await fs.unlink(tempImg2Raw).catch(() => {});
    console.log(`[${jobId}] Images pre-cropped to 360x426`);

    // 2. Create headline box
    if (templateId === "template2") {
      await createRedRoundedRectangleWithText(600, 140, headlineBoxPath, shortHeadline, 15);
    } else {
      await createGradientRoundedRectangleWithText(600, 100, headlineBoxPath, shortHeadline, 15);
    }

    // 3. Build composite background video: two 360x426 photos side by side, stacked over gradient
    const totalFrames = duration * 25;
    const gradientBgPath = path.join(process.cwd(), "public", "gradient-bg.png");

    // Photos are already pre-cropped to 360x426 — apply zoom/pan animation only
    const saturation = blackAndWhite ? 0 : 1.1;
    const photo1Filter =
      `[0:v]fps=25,` +
      `zoompan=z='1+0.08*sin(on/25*1.256637)':x='iw/2-(iw/zoom/2)':y=0:d=${totalFrames}:s=360x426:fps=25,` +
      `eq=brightness='0.1*sin(2.513274*t)':eval=frame,eq=saturation=${saturation}[photo1]`;

    const photo2Filter =
      `[1:v]fps=25,` +
      `zoompan=z='1+0.08*sin(on/25*1.256637+1.571)':x='iw/2-(iw/zoom/2)':y=0:d=${totalFrames}:s=360x426:fps=25,` +
      `eq=brightness='0.1*sin(2.513274*t+1.571)':eval=frame,eq=saturation=${saturation}[photo2]`;

    const gradientFilter =
      `[2:v]fps=25,scale=1440:854:force_original_aspect_ratio=increase,crop=1440:854,` +
      `crop=720:854:'360+360*sin(1.884955592*t)':0[bg_gradient]`;

    const filterComplex =
      `${photo1Filter};${photo2Filter};${gradientFilter};` +
      `[photo1][photo2]hstack[celebrity];` +
      `[celebrity][bg_gradient]vstack`;

    const compositeCmd =
      `ffmpeg -loop 1 -i "${tempImg1Path}" -loop 1 -i "${tempImg2Path}" -loop 1 -i "${gradientBgPath}" ` +
      `-y -filter_complex "${filterComplex}" -t ${duration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${compositeBackgroundPath}"`;

    console.log(`[${jobId}] Creating 2-photo composite background...`);
    await execWithFFmpegEnv(compositeCmd);
    console.log(`[${jobId}] Composite background created`);

    // 4. Render final video via renderVideoNew
    const mainTextElement: TextElement = templateId === "template2"
      ? {
          text: factText,
          x: -1,
          y: 500,
          fontSize: 24,
          color: "black@1",
          fontWeight: "bold",
          lineSpacing: 6,
          width: 680,
          backgroundColor: "yellow@1",
          boxPadding: 20,
        }
      : {
          text: factText,
          x: -1,
          y: 500,
          fontSize: 24,
          color: "white",
          fontWeight: "bold",
          lineSpacing: 6,
          width: 680,
        };

    const result = await renderVideoNew({
      backgroundVideoUrl: compositeBackgroundPath,
      backgroundImageUrl: undefined,
      imageEffect: "none",
      textElements: [mainTextElement],
      gifElements: [
        {
          url: headlineBoxPath,
          x: 60,
          y: 356,
          width: 600,
          height: 140,
        },
        {
          url: "https://media4.giphy.com/media/Ve5hR4qmFYrAKWQbj6/giphy.gif",
          x: 110,
          y: 980,
          width: 500,
          height: 250,
        },
      ],
      emojiElements: [],
      audioUrl,
      audioTrimStart,
      audioTrimEnd,
      duration,
      jobId,
    });

    // Cleanup
    await fs.unlink(tempImg1Path).catch(() => {});
    await fs.unlink(tempImg2Path).catch(() => {});
    await fs.unlink(compositeBackgroundPath).catch(() => {});
    await fs.unlink(headlineBoxPath).catch(() => {});

    console.log(`[${jobId}] Celebrity facts video rendered: ${result.videoUrl}`);
    return result;
  } catch (error) {
    console.error(`[${jobId}] Failed to render celebrity facts video:`, error);
    await fs.unlink(path.join(videosDir, `temp_fact_img1_raw_${jobId}.jpg`)).catch(() => {});
    await fs.unlink(path.join(videosDir, `temp_fact_img2_raw_${jobId}.jpg`)).catch(() => {});
    await fs.unlink(tempImg1Path).catch(() => {});
    await fs.unlink(tempImg2Path).catch(() => {});
    await fs.unlink(compositeBackgroundPath).catch(() => {});
    await fs.unlink(headlineBoxPath).catch(() => {});
    throw error;
  }
}
