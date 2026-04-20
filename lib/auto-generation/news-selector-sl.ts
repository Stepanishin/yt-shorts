import { reserveNextNewsCandidateSL, markNewsCandidateStatusSL } from "@/lib/ingest-news/storage-sl";
import { StoredNewsCandidateSL } from "@/lib/ingest-news/storage-sl";
import { scoreNewsCandidateSL } from "./news-scorer-sl";

const MAX_SCORING_ATTEMPTS = 5;
const MIN_SCORE_THRESHOLD = 5;

export async function selectNextNewsSL(): Promise<StoredNewsCandidateSL | undefined> {
  console.log("Selecting next Slovenian news candidate (with AI scoring)...");

  for (let attempt = 1; attempt <= MAX_SCORING_ATTEMPTS; attempt++) {
    const news = await reserveNextNewsCandidateSL({
      language: "sl",
      sources: ["24ur", "rtvslo", "govorise"],
    });

    if (!news) {
      console.warn("No Slovenian news candidates available");
      return undefined;
    }

    console.log(`\nAttempt ${attempt}/${MAX_SCORING_ATTEMPTS}`);
    console.log(`Selected Slovenian news: ${news._id}`);
    console.log(`Source: ${news.source}`);
    console.log(`Title: ${news.title}`);

    const score = await scoreNewsCandidateSL(news.title, news.summary);
    console.log(`Score: ${score.score}/10 — ${score.reason}`);

    if (score.shouldPublish) {
      console.log(`Slovenian news approved (score ${score.score} >= ${MIN_SCORE_THRESHOLD})`);
      return news;
    }

    console.log(`Slovenian news rejected (score ${score.score} < ${MIN_SCORE_THRESHOLD}), trying next...`);
    await markNewsCandidateStatusSL({
      id: news._id,
      status: "rejected",
      notes: `Auto-rejected: score ${score.score}/10 — ${score.reason}`,
    });
  }

  console.warn(`No suitable Slovenian news found after ${MAX_SCORING_ATTEMPTS} attempts, using last available`);
  const fallback = await reserveNextNewsCandidateSL({
    language: "sl",
    sources: ["24ur", "rtvslo", "govorise"],
  });

  return fallback || undefined;
}

export async function getAvailableNewsCountSL(): Promise<number> {
  const { getNewsCandidateCollectionSL } = await import("@/lib/ingest-news/storage-sl");

  const collection = await getNewsCandidateCollectionSL();

  const count = await collection.countDocuments({
    status: { $in: [undefined, "pending"] },
    language: "sl",
  });

  return count;
}
