import { getActiveAutoGenerationConfigs } from "@/lib/db/auto-generation";
import { getActiveAutoGenerationConfigsDE } from "@/lib/db/auto-generation-de";
import { getActiveAutoGenerationConfigsPT } from "@/lib/db/auto-generation-pt";
import { getActiveAutoGenerationConfigsFR } from "@/lib/db/auto-generation-fr";
import { getActiveNewsAutoGenerationConfigs } from "@/lib/db/auto-generation-news";
import { getScheduledVideos } from "@/lib/db/users";
import {
  getScheduledTimesAhead,
  isTimeSlotAvailable,
} from "./schedule-calculator";
import { generateAutoVideo, generateAutoVideoDE, generateAutoVideoPT, generateAutoVideoFR } from "./generator";
import { generateNewsVideo } from "./news-generator";
import { runNewsIngest } from "@/lib/ingest-news/run";

export interface AutoGenerationResult {
  generated: number;
  scheduled: number;
  failed: number;
  skipped: number;
}

/**
 * Run auto-generation for all active configs
 * Called by cron every 3 hours
 */
export async function runAutoGeneration(): Promise<AutoGenerationResult> {
  console.log("\n" + "=".repeat(60));
  console.log("🤖 AUTO-GENERATION SCHEDULER STARTED");
  console.log("=".repeat(60));

  const result: AutoGenerationResult = {
    generated: 0,
    scheduled: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    // Get all active configurations (ES, DE, PT, FR jokes and ES news)
    const activeConfigsES = await getActiveAutoGenerationConfigs();
    const activeConfigsDE = await getActiveAutoGenerationConfigsDE();
    const activeConfigsPT = await getActiveAutoGenerationConfigsPT();
    const activeConfigsFR = await getActiveAutoGenerationConfigsFR();
    const activeNewsConfigs = await getActiveNewsAutoGenerationConfigs();

    // Check if we should run news ingest (once per day at configured time)
    await checkAndRunNewsIngest(activeNewsConfigs);

    // Combine configs with language and type marker
    const allConfigs = [
      ...activeConfigsES.map(config => ({ config, language: 'es' as const, type: 'joke' as const })),
      ...activeConfigsDE.map(config => ({ config, language: 'de' as const, type: 'joke' as const })),
      ...activeConfigsPT.map(config => ({ config, language: 'pt' as const, type: 'joke' as const })),
      ...activeConfigsFR.map(config => ({ config, language: 'fr' as const, type: 'joke' as const })),
      ...activeNewsConfigs.map(config => ({ config, language: 'es' as const, type: 'news' as const })),
    ];

    console.log(`Found ${allConfigs.length} active configuration(s) (${activeConfigsES.length} ES jokes, ${activeConfigsDE.length} DE jokes, ${activeConfigsPT.length} PT jokes, ${activeConfigsFR.length} FR jokes, ${activeNewsConfigs.length} ES news)`);

    if (allConfigs.length === 0) {
      console.log("No active configurations found");
      return result;
    }

    // Process each configuration
    for (const { config, language, type } of allConfigs) {
      console.log(`\n--- Processing ${language.toUpperCase()} ${type} config for user ${config.userId} ---`);

      try {
        // Get scheduled times for next 24 hours
        const scheduledTimes = getScheduledTimesAhead(
          config.publishTimes,
          24 // Look ahead 24 hours
        );

        console.log(`Config has ${scheduledTimes.length} time slot(s) in next 24h`);

        if (scheduledTimes.length === 0) {
          console.log("No publish times configured");
          result.skipped++;
          continue;
        }

        // Get existing scheduled videos for this user
        const existingScheduledVideos = await getScheduledVideos(config.userId);

        // Filter by channel and language to allow same time slots on different channels
        // IMPORTANT: Use same priority as generator: savedChannelId > manualChannelId > channelId
        const configChannelId = config.youtube?.savedChannelId || config.youtube?.manualChannelId || config.youtube?.channelId;
        const existingScheduledTimes = existingScheduledVideos
          .filter((v) => v.status === "planned")
          // Only consider videos for the same channel/language as conflicting
          .filter((v) => {
            // If both have channelId set, compare them
            if (configChannelId && v.youtubeChannelId) {
              return v.youtubeChannelId === configChannelId;
            }
            // If both are default channel (no channelId), compare by language
            if (!configChannelId && !v.youtubeChannelId) {
              return v.language === language;
            }
            // If one has channelId and other doesn't, they don't conflict
            return false;
          })
          .map((v) => v.scheduledAt);

        console.log(`User has ${existingScheduledTimes.length} existing scheduled video(s) for this channel`);

        // Find available time slots
        let generatedForThisConfig = 0;

        for (const scheduledTime of scheduledTimes) {
          // Check if we've reached the daily limit
          if (generatedForThisConfig >= config.videosPerDay) {
            console.log(`Reached daily limit (${config.videosPerDay} videos)`);
            break;
          }

          // Check if time slot is available
          const isAvailable = isTimeSlotAvailable(
            scheduledTime,
            existingScheduledTimes,
            5 // 5 minutes tolerance
          );

          if (!isAvailable) {
            console.log(
              `Time slot ${scheduledTime.toISOString()} already occupied`
            );
            result.skipped++;
            continue;
          }

          // Generate video for this time slot
          console.log(
            `\n🎬 Generating ${language.toUpperCase()} ${type} video for ${scheduledTime.toISOString()}...`
          );

          try {
            // Use appropriate generation function based on type and language
            if (type === 'news') {
              await generateNewsVideo(
                config.userId,
                config._id!.toString(),
                scheduledTime
              );
            } else if (language === 'de') {
              await generateAutoVideoDE(
                config.userId,
                config._id!.toString(),
                scheduledTime
              );
            } else if (language === 'pt') {
              await generateAutoVideoPT(
                config.userId,
                config._id!.toString(),
                scheduledTime
              );
            } else if (language === 'fr') {
              await generateAutoVideoFR(
                config.userId,
                config._id!.toString(),
                scheduledTime
              );
            } else {
              await generateAutoVideo(
                config.userId,
                config._id!.toString(),
                scheduledTime
              );
            }

            result.generated++;
            result.scheduled++;
            generatedForThisConfig++;

            // Add to existing scheduled times to avoid duplicates
            existingScheduledTimes.push(scheduledTime);

            console.log(`✅ Video generated and scheduled successfully`);
          } catch (genError) {
            console.error(`❌ Failed to generate video:`, genError);
            result.failed++;
          }
        }

        console.log(
          `Completed for user ${config.userId}: ${generatedForThisConfig} video(s) generated`
        );
      } catch (configError) {
        console.error(`Error processing config for user ${config.userId}:`, configError);
        result.failed++;
      }
    }
  } catch (error) {
    console.error("Fatal error in auto-generation scheduler:", error);
    throw error;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🤖 AUTO-GENERATION SCHEDULER COMPLETED");
  console.log(`Generated: ${result.generated}, Scheduled: ${result.scheduled}`);
  console.log(`Failed: ${result.failed}, Skipped: ${result.skipped}`);
  console.log("=".repeat(60) + "\n");

  return result;
}

/**
 * Check if we should run news ingest based on configured schedule
 * Runs once per day at the configured time
 */
async function checkAndRunNewsIngest(newsConfigs: any[]): Promise<void> {
  // Only run if there are active news configs
  if (newsConfigs.length === 0) {
    return;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  console.log(`\n📰 Checking news ingest schedule (current time: ${currentHour}:${currentMinute.toString().padStart(2, '0')})`);

  // Check if any config has news ingest scheduled for this time window
  // Since scheduler runs every 3 hours, we check if scheduled time is within the last 3 hours
  for (const config of newsConfigs) {
    const schedule = config.newsIngestSchedule;

    // Skip if not configured or not enabled
    if (!schedule || !schedule.isEnabled) {
      continue;
    }

    const scheduledHour = schedule.hour;
    const scheduledMinute = schedule.minute;

    console.log(`Config for user ${config.userId}: scheduled at ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')}`);

    // Check if the scheduled time is within the last 3 hours (window since last scheduler run)
    // This ensures we don't miss the ingest even if scheduler is slightly delayed
    const scheduledTime = new Date(now);
    scheduledTime.setHours(scheduledHour, scheduledMinute, 0, 0);

    const timeDiffHours = (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60);

    // If scheduled time is within last 3 hours (but not in the future)
    if (timeDiffHours >= 0 && timeDiffHours < 3) {
      console.log(`✅ Time to run news ingest! (scheduled ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')}, current ${currentHour}:${currentMinute.toString().padStart(2, '0')})`);

      try {
        const result = await runNewsIngest();
        console.log(`📰 News ingest completed: ${result.totalInserted} new items inserted`);

        // Only run once per scheduler cycle
        return;
      } catch (error) {
        console.error("❌ News ingest failed:", error);
      }
    } else if (timeDiffHours < 0) {
      console.log(`⏭️  Scheduled time is in the future (${Math.abs(timeDiffHours).toFixed(1)}h from now)`);
    } else {
      console.log(`⏭️  Scheduled time was ${timeDiffHours.toFixed(1)}h ago (outside 3h window)`);
    }
  }
}
