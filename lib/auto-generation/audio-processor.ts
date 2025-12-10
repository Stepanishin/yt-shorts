import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface AudioCut {
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

/**
 * Get media duration using ffprobe
 */
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
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
