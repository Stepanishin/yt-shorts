/**
 * Cleanup script to delete all Portuguese news candidates
 * Run this after fixing the scraper to re-fetch news with proper images
 */

import { getNewsCandidateCollectionPT } from "@/lib/ingest-news/storage-pt";

async function cleanupPTNews() {
  console.log("Cleaning up Portuguese news candidates...");

  const collection = await getNewsCandidateCollectionPT();

  // Delete all pending Portuguese news
  const result = await collection.deleteMany({
    status: { $in: ["pending", "reserved", undefined] }
  });

  console.log(`✓ Deleted ${result.deletedCount} Portuguese news candidates`);

  process.exit(0);
}

cleanupPTNews().catch((error) => {
  console.error("Failed to cleanup Portuguese news:", error);
  process.exit(1);
});
