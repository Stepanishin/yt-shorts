import { config } from "dotenv";
import { getJokeCandidateCollection } from "@/lib/ingest/storage";

config();

async function checkExternalIds() {
  const collection = await getJokeCandidateCollection();
  
  const ricuibJokes = await collection
    .find({ source: { $in: ["ricuib-1000chistes", "ricuib-pintamania"] } })
    .limit(10)
    .toArray();

  console.log("Примеры externalId из базы данных:\n");
  
  for (const joke of ricuibJokes) {
    console.log(`Source: ${joke.source}`);
    console.log(`Title: ${joke.title}`);
    console.log(`ExternalId: ${joke.externalId}`);
    console.log(`Meta:`, joke.meta);
    console.log("-".repeat(80));
  }
  
  process.exit(0);
}

checkExternalIds().catch(console.error);
