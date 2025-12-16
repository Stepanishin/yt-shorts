import { exec } from "child_process";
import { promisify } from "util";
import * as fsSync from "fs";

const execAsync = promisify(exec);

export interface AudioCut {
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

/**
 * Выполняет команду с правильными переменными окружения для FFmpeg/ffprobe
 * Устанавливает LD_LIBRARY_PATH для загрузки библиотек FFmpeg
 */
async function execWithFFmpegEnv(command: string): Promise<{ stdout: string; stderr: string }> {
  // Пути к библиотекам FFmpeg в DigitalOcean APT buildpack
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
 * Get media duration using ffprobe with proper FFmpeg environment
 */
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execWithFFmpegEnv(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );

    const duration = parseFloat(stdout.trim());

    if (isNaN(duration)) {
      throw new Error(`Invalid duration for ${filePath}`);
    }

    return duration;
  } catch (error) {
    console.error("Error getting media duration:", error);
    throw error;
  }
}

/**
 * Prepare audio cut parameters
 * @param audioUrl - URL of the audio file
 * @param targetDuration - Target duration in seconds
 * @param useRandomStart - If true, start from random position
 * @returns AudioCut with start and end times
 */
export async function prepareAudioCut(
  audioUrl: string,
  targetDuration: number,
  useRandomStart: boolean
): Promise<AudioCut> {
  try {
    // Get audio duration using ffprobe
    const audioDuration = await getMediaDuration(audioUrl);

    console.log(`Audio duration: ${audioDuration}s, target: ${targetDuration}s`);

    if (audioDuration <= targetDuration) {
      // Audio is shorter than or equal to target - use it fully
      console.log("Audio is shorter than target, using full audio");
      return { start: 0, end: audioDuration };
    }

    if (!useRandomStart) {
      // Start from beginning
      console.log("Using audio from beginning");
      return { start: 0, end: targetDuration };
    }

    // Random start
    const maxStartTime = audioDuration - targetDuration;
    const randomStart = Math.random() * maxStartTime;

    console.log(`Random audio cut: ${randomStart.toFixed(2)}s - ${(randomStart + targetDuration).toFixed(2)}s`);

    return {
      start: randomStart,
      end: randomStart + targetDuration,
    };
  } catch (error) {
    console.error("Error preparing audio cut:", error);
    throw error;
  }
}

/**
 * Select random item from array
 */
export function selectRandomFromArray<T>(array: T[]): T | null {
  if (!array || array.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
