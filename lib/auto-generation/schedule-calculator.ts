import { PublishTime } from "@/lib/db/auto-generation";

/**
 * Calculate next available publish time from config
 * @param publishTimes - Array of configured publish times
 * @param currentDate - Current date (for testing)
 * @returns Next available publish date
 */
export function calculateNextPublishTime(
  publishTimes: PublishTime[],
  currentDate: Date = new Date()
): Date {
  const enabledTimes = publishTimes.filter((t) => t.isEnabled);

  if (enabledTimes.length === 0) {
    throw new Error("No publish times configured");
  }

  // Sort by time (hour and minute)
  const sortedTimes = [...enabledTimes].sort((a, b) => {
    return a.hour * 60 + a.minute - (b.hour * 60 + b.minute);
  });

  const now = currentDate;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Find next time today
  for (const time of sortedTimes) {
    const timeMinutes = time.hour * 60 + time.minute;
    if (timeMinutes > currentMinutes) {
      const scheduledDate = new Date(now);
      scheduledDate.setHours(time.hour, time.minute, 0, 0);
      return scheduledDate;
    }
  }

  // All times today have passed - use first time tomorrow
  const nextDate = new Date(now);
  nextDate.setDate(nextDate.getDate() + 1);
  nextDate.setHours(sortedTimes[0].hour, sortedTimes[0].minute, 0, 0);

  return nextDate;
}

/**
 * Get all scheduled times for the next N hours
 * @param publishTimes - Configured publish times
 * @param hoursAhead - How many hours to look ahead (default: 24)
 * @returns Array of Date objects
 */
export function getScheduledTimesAhead(
  publishTimes: PublishTime[],
  hoursAhead: number = 24
): Date[] {
  const enabledTimes = publishTimes.filter((t) => t.isEnabled);

  if (enabledTimes.length === 0) {
    return [];
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const scheduledTimes: Date[] = [];

  // Check each enabled time slot
  for (const time of enabledTimes) {
    // Today
    const todayTime = new Date(now);
    todayTime.setHours(time.hour, time.minute, 0, 0);

    if (todayTime >= now && todayTime <= endTime) {
      scheduledTimes.push(todayTime);
    }

    // Tomorrow (if within range)
    const tomorrowTime = new Date(now);
    tomorrowTime.setDate(tomorrowTime.getDate() + 1);
    tomorrowTime.setHours(time.hour, time.minute, 0, 0);

    if (tomorrowTime <= endTime) {
      scheduledTimes.push(tomorrowTime);
    }
  }

  // Sort by time
  scheduledTimes.sort((a, b) => a.getTime() - b.getTime());

  return scheduledTimes;
}

/**
 * Check if a specific time slot is available
 * @param targetTime - Time to check
 * @param existingScheduledTimes - Array of already scheduled times
 * @param toleranceMinutes - Tolerance in minutes (default: 5)
 * @returns true if slot is available
 */
export function isTimeSlotAvailable(
  targetTime: Date,
  existingScheduledTimes: Date[],
  toleranceMinutes: number = 5
): boolean {
  const targetTimestamp = targetTime.getTime();
  const toleranceMs = toleranceMinutes * 60 * 1000;

  for (const existing of existingScheduledTimes) {
    const existingTimestamp = existing.getTime();
    const diff = Math.abs(targetTimestamp - existingTimestamp);

    if (diff < toleranceMs) {
      return false; // Too close to existing scheduled time
    }
  }

  return true;
}
