import { autoPublishScheduledVideos } from "./youtube/auto-publisher";
import { runAutoGeneration } from "./auto-generation/scheduler";
import { runNewsIngest } from "./ingest-news/run";
import { runNewsIngestPT } from "./ingest-news/run-pt";
import { runNewsIngestEN } from "./ingest-news/run-en";
import { runNewsIngestSL } from "./ingest-news/run-sl";
import { runRedditIngest } from "./ingest-reddit/run";

const CHECK_INTERVAL = 10 * 60 * 1000; // 10 минут в миллисекундах
const AUTO_GEN_CHECK_INTERVAL = 1 * 60 * 60 * 1000; // 1 часа в миллисекундах
const NEWS_INGEST_INTERVAL = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах (Spanish)
const NEWS_INGEST_INTERVAL_PT = 2 * 60 * 60 * 1000; // 2 часа в миллисекундах (Portuguese)
const NEWS_INGEST_INTERVAL_EN = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах (English)
const NEWS_INGEST_INTERVAL_SL = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах (Slovenian)
const REDDIT_INGEST_INTERVAL = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах (Reddit Memes)
let schedulerRunning = false;

/**
 * Запускает автоматическую проверку и публикацию видео каждые 10 минут
 */
export function startScheduler() {
  // Проверяем dev режим
  const isDev = process.env.IS_DEV === "true";

  if (isDev) {
    console.log("🛑 Scheduler disabled in dev mode (IS_DEV=true)");
    console.log("   Auto-generation and scheduled video publishing are paused");
    return;
  }

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

  // Затем каждый час
  setInterval(async () => {
    console.log(`\n📹 [${new Date().toISOString()}] Running auto-generation...`);

    try {
      const result = await runAutoGeneration();
      console.log(`✅ Auto-generation completed: ${result.generated} video(s) generated, ${result.failed} failed, ${result.skipped} skipped`);
    } catch (error) {
      console.error("❌ Error in auto-generation:", error);
    }
  }, AUTO_GEN_CHECK_INTERVAL);

  // === News Ingest Scheduler (каждые 3 часа) ===
  console.log("📰 Starting News Ingest scheduler (Spanish)...");
  console.log(`   Will scrape Spanish news every ${NEWS_INGEST_INTERVAL / 1000 / 60 / 60} hours`);

  // Первый запуск через 2 минуты после старта
  setTimeout(() => {
    console.log("📰 Running initial Spanish news ingest...");
    runNewsIngest().catch(error => {
      console.error("Error in initial Spanish news ingest:", error);
    });
  }, 2 * 60 * 1000);

  // Затем каждые 3 часа
  setInterval(async () => {
    console.log(`\n📰 [${new Date().toISOString()}] Running Spanish news ingest...`);

    try {
      const result = await runNewsIngest();
      console.log(`✅ Spanish news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`);
    } catch (error) {
      console.error("❌ Error in Spanish news ingest:", error);
    }
  }, NEWS_INGEST_INTERVAL);

  // === Portuguese News Ingest Scheduler (каждые 2 часа) ===
  console.log("📰 Starting News Ingest scheduler (Portuguese)...");
  console.log(`   Will scrape Portuguese news every ${NEWS_INGEST_INTERVAL_PT / 1000 / 60 / 60} hours`);

  // Первый запуск через 2.5 минуты после старта (немного позже испанского)
  setTimeout(() => {
    console.log("📰 Running initial Portuguese news ingest...");
    runNewsIngestPT().catch(error => {
      console.error("Error in initial Portuguese news ingest:", error);
    });
  }, 2.5 * 60 * 1000);

  // Затем каждые 2 часа
  setInterval(async () => {
    console.log(`\n📰 [${new Date().toISOString()}] Running Portuguese news ingest...`);

    try {
      const result = await runNewsIngestPT();
      console.log(`✅ Portuguese news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`);
    } catch (error) {
      console.error("❌ Error in Portuguese news ingest:", error);
    }
  }, NEWS_INGEST_INTERVAL_PT);

  // === English News Ingest Scheduler (каждые 3 часа) ===
  console.log("📰 Starting News Ingest scheduler (English)...");
  console.log(`   Will scrape English news every ${NEWS_INGEST_INTERVAL_EN / 1000 / 60 / 60} hours`);

  // Первый запуск через 3 минуты после старта
  setTimeout(() => {
    console.log("📰 Running initial English news ingest...");
    runNewsIngestEN().catch(error => {
      console.error("Error in initial English news ingest:", error);
    });
  }, 3 * 60 * 1000);

  // Затем каждые 3 часа
  setInterval(async () => {
    console.log(`\n📰 [${new Date().toISOString()}] Running English news ingest...`);

    try {
      const result = await runNewsIngestEN();
      console.log(`✅ English news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`);
    } catch (error) {
      console.error("❌ Error in English news ingest:", error);
    }
  }, NEWS_INGEST_INTERVAL_EN);

  // === Slovenian News Ingest Scheduler (каждые 3 часа) ===
  console.log("📰 Starting News Ingest scheduler (Slovenian)...");
  console.log(`   Will scrape Slovenian news every ${NEWS_INGEST_INTERVAL_SL / 1000 / 60 / 60} hours`);

  setTimeout(() => {
    console.log("📰 Running initial Slovenian news ingest...");
    runNewsIngestSL().catch(error => {
      console.error("Error in initial Slovenian news ingest:", error);
    });
  }, 3.5 * 60 * 1000);

  setInterval(async () => {
    console.log(`\n📰 [${new Date().toISOString()}] Running Slovenian news ingest...`);

    try {
      const result = await runNewsIngestSL();
      console.log(`✅ Slovenian news ingest completed: ${result.totalInserted} inserted, ${result.totalDeleted} deleted`);
    } catch (error) {
      console.error("❌ Error in Slovenian news ingest:", error);
    }
  }, NEWS_INGEST_INTERVAL_SL);

  // === Reddit Memes Ingest Scheduler (каждые 3 часа) ===
  console.log("🎭 Starting Reddit Memes Ingest scheduler...");
  console.log(`   Will scrape Reddit memes every ${REDDIT_INGEST_INTERVAL / 1000 / 60 / 60} hours`);

  // Первый запуск через 3.5 минуты после старта
  setTimeout(() => {
    console.log("🎭 Running initial Reddit memes ingest...");
    runRedditIngest().catch(error => {
      console.error("Error in initial Reddit memes ingest:", error);
    });
  }, 3.5 * 60 * 1000);

  // Затем каждые 3 часа
  setInterval(async () => {
    console.log(`\n🎭 [${new Date().toISOString()}] Running Reddit memes ingest...`);

    try {
      const result = await runRedditIngest();
      console.log(`✅ Reddit memes ingest completed: ${result.totalInserted} inserted, ${result.totalDuplicates} duplicates`);
    } catch (error) {
      console.error("❌ Error in Reddit memes ingest:", error);
    }
  }, REDDIT_INGEST_INTERVAL);

  console.log("✅ Scheduler started successfully");
}
