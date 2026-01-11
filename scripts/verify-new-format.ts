import { config } from "dotenv";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

config();

async function verifyNewFormat() {
  const collection = await getJokeCandidateCollection();

  const ricuibJokes = await collection
    .find({ source: { $in: ["ricuib-1000chistes", "ricuib-pintamania"] } })
    .limit(10)
    .toArray();

  console.log("🔍 Проверка формата externalId:\n");

  let newFormatCount = 0;
  let oldFormatCount = 0;

  for (const joke of ricuibJokes) {
    const isNewFormat = joke.externalId && joke.externalId.startsWith("ricuib:");

    if (isNewFormat) {
      newFormatCount++;
    } else {
      oldFormatCount++;
    }

    console.log(`${isNewFormat ? '✅' : '❌'} ${joke.externalId}`);
    console.log(`   Title: ${joke.title}`);
    console.log(`   Index в meta: ${joke.meta?.ricuibIndex}`);
    console.log();
  }

  console.log("\n📊 ИТОГИ:");
  console.log(`   Новый формат (ricuib:origen:index): ${newFormatCount}`);
  console.log(`   Старый формат (origen:title): ${oldFormatCount}`);

  process.exit(0);
}

verifyNewFormat().catch(console.error);
