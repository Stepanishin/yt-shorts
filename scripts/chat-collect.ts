/**
 * Сборщик активности чата для всех включённых стримеров (фаза 2, см. PLAN_CLIPS.md).
 *
 *   npx tsx scripts/chat-collect.ts [--streamer <login>]
 *
 * Работает бесконечно, пишет 5-секундные счётчики в MongoDB `stream_chat_buckets`.
 */
import { config } from "dotenv";
config();

import { STREAMERS } from "@/lib/clips/config";
import { ChatCollector } from "@/lib/clips/chat";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const only = arg("streamer");
  const channels = STREAMERS.filter((s) => s.enabled && (!only || s.login === only)).map((s) => s.login);
  if (channels.length === 0) throw new Error("No enabled streamers");

  const collector = new ChatCollector(channels, (msg) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`));
  await collector.start();

  const shutdown = async () => {
    await collector.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
