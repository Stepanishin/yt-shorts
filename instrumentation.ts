/**
 * Instrumentation file - запускается при старте сервера Next.js
 * Здесь мы запускаем scheduler для автоматической публикации видео
 */
export async function register() {
  // Запускаем только на сервере (не в браузере)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
