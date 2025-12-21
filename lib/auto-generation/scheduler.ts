import { getActiveAutoGenerationConfigs } from "@/lib/db/auto-generation";
import { getActiveAutoGenerationConfigsDE } from "@/lib/db/auto-generation-de";
import { getScheduledVideos } from "@/lib/db/users";
import {
  getScheduledTimesAhead,
  isTimeSlotAvailable,
} from "./schedule-calculator";
import { generateAutoVideo, generateAutoVideoDE } from "./generator";

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
    // Get all active configurations (both ES and DE)
    const activeConfigsES = await getActiveAutoGenerationConfigs();
    const activeConfigsDE = await getActiveAutoGenerationConfigsDE();

    // Combine configs with language marker
    const allConfigs = [
      ...activeConfigsES.map(config => ({ config, language: 'es' as const })),
      ...activeConfigsDE.map(config => ({ config, language: 'de' as const })),
    ];

    console.log(`Found ${allConfigs.length} active configuration(s) (${activeConfigsES.length} ES, ${activeConfigsDE.length} DE)`);

    if (allConfigs.length === 0) {
      console.log("No active configurations found");
      return result;
    }

    // Process each configuration
    for (const { config, language } of allConfigs) {
      console.log(`\n--- Processing ${language.toUpperCase()} config for user ${config.userId} ---`);

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
        const configChannelId = config.youtube?.channelId;
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
            `\n🎬 Generating ${language.toUpperCase()} video for ${scheduledTime.toISOString()}...`
          );

          try {
            // Use appropriate generation function based on language
            if (language === 'de') {
              await generateAutoVideoDE(
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
