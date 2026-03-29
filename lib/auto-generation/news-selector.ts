import { reserveNextNewsCandidate, markNewsCandidateStatus } from "@/lib/ingest-news/storage";
import { StoredNewsCandidate } from "@/lib/ingest-news/storage";
import { scoreNewsCandidate } from "./news-scorer";

const MAX_SCORING_ATTEMPTS = 5; // Max news items to evaluate before giving up
const MIN_SCORE_THRESHOLD = 5; // Minimum score to publish (1-10)

/**
 * Select next news item for generation
 * Uses AI scoring to filter out low-viral-potential news
 * Reserves the news item in the database
 */
export async function selectNextNews(): Promise<StoredNewsCandidate | undefined> {
  console.log("Selecting next news candidate (with AI scoring)...");

  for (let attempt = 1; attempt <= MAX_SCORING_ATTEMPTS; attempt++) {
    const news = await reserveNextNewsCandidate({
      language: "es",
      sources: ["hola", "diezminutos"],
    });

    if (!news) {
      console.warn("No news candidates available");
      return undefined;
    }

    console.log(`\n📰 Attempt ${attempt}/${MAX_SCORING_ATTEMPTS}`);
    console.log(`Selected news: ${news._id}`);
    console.log(`Source: ${news.source}`);
    console.log(`Title: ${news.title}`);

    // Score the news item
    const score = await scoreNewsCandidate(news.title, news.summary);
    console.log(`🎯 Score: ${score.score}/10 — ${score.reason}`);

    if (score.shouldPublish) {
      console.log(`✅ News approved (score ${score.score} >= ${MIN_SCORE_THRESHOLD})`);
      return news;
    }

    // Reject low-scoring news — mark as rejected so it's not picked again
    console.log(`❌ News rejected (score ${score.score} < ${MIN_SCORE_THRESHOLD}), trying next...`);
    await markNewsCandidateStatus({
      id: news._id,
      status: "rejected",
      notes: `Auto-rejected: score ${score.score}/10 — ${score.reason}`,
    });
  }

  console.warn(`⚠️ No suitable news found after ${MAX_SCORING_ATTEMPTS} attempts, using last available`);
  // Fallback: just take the next one without scoring
  const fallback = await reserveNextNewsCandidate({
    language: "es",
    sources: ["hola", "diezminutos"],
  });

  return fallback || undefined;
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
