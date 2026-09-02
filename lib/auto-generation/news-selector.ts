import { reserveNextNewsCandidate, markNewsCandidateStatus, findRecentlyUsedNewsTitles } from "@/lib/ingest-news/storage";
import { StoredNewsCandidate } from "@/lib/ingest-news/storage";
import { scoreNewsCandidate, MIN_SCORE_THRESHOLD } from "./news-scorer";

const MAX_SCORING_ATTEMPTS = 5; // Max news items to evaluate before giving up
const RECENT_TITLES_DAYS = 7; // Look-back window for the anti-repeat rule

/**
 * Source priority: Hola first (primary source), Diez Minutos only when
 * Hola has no pending candidates left.
 */
async function reserveNextWithSourcePriority() {
  const fromHola = await reserveNextNewsCandidate({
    language: "es",
    sources: ["hola"],
  });
  if (fromHola) return fromHola;

  return reserveNextNewsCandidate({
    language: "es",
    sources: ["diezminutos"],
  });
}
// Second tier: when nothing reaches MIN_SCORE_THRESHOLD, publish the best
// candidate of this round with at least this score instead of leaving the
// slot empty. Real junk (<= 4) is still never published via scoring.
const SALVAGE_SCORE_THRESHOLD = 5;

/**
 * Select next news item for generation.
 * Two-tier selection:
 *  1. Preferred: first candidate with score >= MIN_SCORE_THRESHOLD.
 *  2. Salvage: best candidate of the evaluated batch with score >= SALVAGE_SCORE_THRESHOLD.
 *  3. Last resort: next unscored candidate (only reached when scoring produced nothing).
 * Reserves the returned news item in the database.
 */
export async function selectNextNews(): Promise<StoredNewsCandidate | undefined> {
  console.log("Selecting next news candidate (with AI scoring)...");

  // Recently used titles for the anti-repeat rule (best-effort)
  let recentTitles: string[] = [];
  try {
    recentTitles = await findRecentlyUsedNewsTitles(RECENT_TITLES_DAYS);
    console.log(`Anti-repeat context: ${recentTitles.length} titles from last ${RECENT_TITLES_DAYS} days`);
  } catch (error) {
    console.warn("Failed to load recent titles for anti-repeat, scoring without them:", error);
  }

  const evaluated: { news: StoredNewsCandidate; score: number }[] = [];

  for (let attempt = 1; attempt <= MAX_SCORING_ATTEMPTS; attempt++) {
    const news = await reserveNextWithSourcePriority();

    if (!news) {
      console.warn("No more news candidates available, moving to salvage tier");
      break;
    }

    console.log(`\n📰 Attempt ${attempt}/${MAX_SCORING_ATTEMPTS}`);
    console.log(`Selected news: ${news._id}`);
    console.log(`Source: ${news.source}`);
    console.log(`Title: ${news.title}`);

    // Score the news item (with freshness context)
    const ageHours = news.publishedDate
      ? (Date.now() - new Date(news.publishedDate).getTime()) / 3600000
      : undefined;
    const score = await scoreNewsCandidate(news.title, news.summary, recentTitles, ageHours);
    console.log(`🎯 Score: ${score.score}/10 — ${score.reason}`);

    if (score.shouldPublish) {
      console.log(`✅ News approved (score ${score.score} >= ${MIN_SCORE_THRESHOLD})`);
      return news;
    }

    evaluated.push({ news, score: score.score });

    // Reject low-scoring news — may be salvaged below if nothing better shows up
    console.log(`❌ News below threshold (score ${score.score} < ${MIN_SCORE_THRESHOLD}), trying next...`);
    await markNewsCandidateStatus({
      id: news._id,
      status: "rejected",
      notes: `Auto-rejected: score ${score.score}/10 — ${score.reason}`,
    });
  }

  // Salvage tier: fixed publish slots are worth more than a perfect score.
  // Take the best of what we just evaluated, if it's at least mediocre.
  const salvage = evaluated
    .filter((e) => e.score >= SALVAGE_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)[0];

  if (salvage) {
    console.log(`🩹 Salvage: publishing best of batch (score ${salvage.score}/10): ${salvage.news.title}`);
    await markNewsCandidateStatus({
      id: salvage.news._id,
      status: "reserved",
      notes: `Salvaged: score ${salvage.score}/10 — best available, nothing scored >= ${MIN_SCORE_THRESHOLD}`,
      salvageScore: salvage.score,
    });
    return salvage.news;
  }

  console.warn(`⚠️ No suitable news found after ${MAX_SCORING_ATTEMPTS} attempts, using last available`);
  // Fallback: just take the next one without scoring (Hola first here too)
  const fallback = await reserveNextWithSourcePriority();

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
