import { reserveNextNewsCandidate } from "@/lib/ingest-news/storage";
import { StoredNewsCandidate } from "@/lib/ingest-news/storage";

/**
 * Select next news item for generation
 * Reserves the news item in the database
 */
export async function selectNextNews(): Promise<StoredNewsCandidate | undefined> {
  console.log("Selecting next news candidate...");

  const news = await reserveNextNewsCandidate({
    language: "es",
    sources: ["hola", "diezminutos"], // Support both Hola.com and DiezMinutos
  });

  if (!news) {
    console.warn("No news candidates available");
    return undefined;
  }

  console.log(`Selected news: ${news._id}`);
  console.log(`Source: ${news.source}`);
  console.log(`Title: ${news.title}`);
  console.log(`Summary: ${news.summary.substring(0, 100)}...`);

  return news;
}

/**
 * Get count of available news for generation
 */
export async function getAvailableNewsCount(): Promise<number> {
  const { getNewsCandidateCollection } = await import("@/lib/ingest-news/storage");

  const collection = await getNewsCandidateCollection();

  const count = await collection.countDocuments({
    status: { $in: [undefined, "pending"] },
    language: "es",
  });

  return count;
}
