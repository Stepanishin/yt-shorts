import { reserveNextNewsCandidatePT } from "@/lib/ingest-news/storage-pt";
import { StoredNewsCandidatePT } from "@/lib/ingest-news/storage-pt";

/**
 * Select next Portuguese news item for generation
 * Reserves the news item in the database
 */
export async function selectNextNews(): Promise<StoredNewsCandidatePT | undefined> {
  console.log("Selecting next Portuguese news candidate...");

  const news = await reserveNextNewsCandidatePT({
    language: "pt",
    sources: ["caras", "googlenews"], // Portuguese sources: CM Jornal and Google News PT
  });

  if (!news) {
    console.warn("No Portuguese news candidates available");
    return undefined;
  }

  console.log(`Selected Portuguese news: ${news._id}`);
  console.log(`Source: ${news.source}`);
  console.log(`Title: ${news.title}`);
  console.log(`Summary: ${news.summary.substring(0, 100)}...`);

  return news;
}

/**
 * Get count of available Portuguese news for generation
 */
export async function getAvailableNewsCount(): Promise<number> {
  const { getNewsCandidateCollectionPT } = await import("@/lib/ingest-news/storage-pt");

  const collection = await getNewsCandidateCollectionPT();

  const count = await collection.countDocuments({
    status: { $in: [undefined, "pending"] },
    language: "pt",
  });

  return count;
}
