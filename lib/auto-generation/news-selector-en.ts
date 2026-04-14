import { reserveNextNewsCandidateEN, markNewsCandidateStatusEN } from "@/lib/ingest-news/storage-en";
import { StoredNewsCandidateEN } from "@/lib/ingest-news/storage-en";
import { scoreNewsCandidateEN } from "./news-scorer-en";

const MAX_SCORING_ATTEMPTS = 5;
const MIN_SCORE_THRESHOLD = 5;

/**
 * Select next English news item for generation.
 * Uses AI scoring to filter out low-viral-potential news.
 * Reserves the news item in the database.
 */
export async function selectNextNewsEN(): Promise<StoredNewsCandidateEN | undefined> {
  console.log("Selecting next English news candidate (with AI scoring)...");

  for (let attempt = 1; attempt <= MAX_SCORING_ATTEMPTS; attempt++) {
    const news = await reserveNextNewsCandidateEN({
      language: "en",
      sources: ["pagesix", "googlenews-en"],
    });

    if (!news) {
      console.warn("No English news candidates available");
      return undefined;
    }

    console.log(`\n📰 Attempt ${attempt}/${MAX_SCORING_ATTEMPTS}`);
    console.log(`Selected English news: ${news._id}`);
    console.log(`Source: ${news.source}`);
    console.log(`Title: ${news.title}`);

    const score = await scoreNewsCandidateEN(news.title, news.summary);
    console.log(`🎯 Score: ${score.score}/10 — ${score.reason}`);

    if (score.shouldPublish) {
      console.log(`✅ English news approved (score ${score.score} >= ${MIN_SCORE_THRESHOLD})`);
      return news;
    }

    console.log(`❌ English news rejected (score ${score.score} < ${MIN_SCORE_THRESHOLD}), trying next...`);
    await markNewsCandidateStatusEN({
      id: news._id,
      status: "rejected",
      notes: `Auto-rejected: score ${score.score}/10 — ${score.reason}`,
    });
  }

  console.warn(`⚠️ No suitable English news found after ${MAX_SCORING_ATTEMPTS} attempts, using last available`);
  const fallback = await reserveNextNewsCandidateEN({
    language: "en",
    sources: ["pagesix", "googlenews-en"],
  });

  return fallback || undefined;
}

/**
 * Get count of available English news for generation
 */
export async function getAvailableNewsCountEN(): Promise<number> {
  const { getNewsCandidateCollectionEN } = await import("@/lib/ingest-news/storage-en");

  const collection = await getNewsCandidateCollectionEN();

  const count = await collection.countDocuments({
    status: { $in: [undefined, "pending"] },
    language: "en",
  });

  return count;
}
