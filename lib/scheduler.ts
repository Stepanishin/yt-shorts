import { autoPublishScheduledVideos } from "./youtube/auto-publisher";
import { runAutoGeneration } from "./auto-generation/scheduler";

const CHECK_INTERVAL = 10 * 60 * 1000; // 10 минут в миллисекундах
const AUTO_GEN_CHECK_INTERVAL = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
let schedulerRunning = false;

/**
 * Запускает автоматическую проверку и публикацию видео каждые 10 минут
 */
export function startScheduler() {
  // Предотвращаем множественный запуск
  if (schedulerRunning) {
    console.log("⚠️ Scheduler already running");
    return;
  }

  schedulerRunning = true;
  console.log("🚀 Starting YouTube auto-publisher scheduler...");
  console.log(`   Will check for scheduled videos every ${CHECK_INTERVAL / 1000 / 60} minutes`);

  // Запускаем через 1 минуту после старта сервера (чтобы все успело инициализироваться)
  setTimeout(() => {
    console.log("📅 Running initial check for scheduled videos...");
    autoPublishScheduledVideos().catch(error => {
      console.error("Error in initial auto-publish:", error);
    });
  }, 60 * 1000);

  // Затем каждые 10 минут
  setInterval(async () => {
    console.log(`\n📅 [${new Date().toISOString()}] Checking for scheduled videos...`);

    try {
      const result = await autoPublishScheduledVideos();

      if ('skipped' in result && result.skipped) {
        console.log("⏭️ Skipped (already publishing)");
      } else if ('success' in result && result.success === 0 && result.failed === 0) {
        console.log("✅ No videos to publish");
      } else if ('success' in result) {
        console.log(`✅ Published: ${result.success}, Failed: ${result.failed}`);
      }
    } catch (error) {
      console.error("❌ Error in auto-publish:", error);
    }
  }, CHECK_INTERVAL);

  // === Auto-Generation Scheduler (каждые 3 часа) ===
  console.log("🤖 Starting Auto-Generation scheduler...");
  console.log(`   Will check for auto-generation every ${AUTO_GEN_CHECK_INTERVAL / 1000 / 60 / 60} hours`);

  // Первый запуск через 5 минут после старта
  setTimeout(() => {
    console.log("📹 Running initial auto-generation check...");
    runAutoGeneration().catch(error => {
      console.error("Error in initial auto-generation:", error);
    });
  }, 5 * 60 * 1000);

  // Затем каждые 3 часа
  setInterval(async () => {
    console.log(`\n📹 [${new Date().toISOString()}] Running auto-generation...`);

    try {
      const result = await runAutoGeneration();
      console.log(`✅ Auto-generation completed: ${result.generated} video(s) generated, ${result.failed} failed, ${result.skipped} skipped`);
    } catch (error) {
      console.error("❌ Error in auto-generation:", error);
    }
  }, AUTO_GEN_CHECK_INTERVAL);

  console.log("✅ Scheduler started successfully");
}
