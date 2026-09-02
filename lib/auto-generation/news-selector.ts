import { ObjectId } from "mongodb";
import { reserveNextNewsCandidate, markNewsCandidateStatus, findRecentlyUsedNewsTitles } from "@/lib/ingest-news/storage";
import { StoredNewsCandidate } from "@/lib/ingest-news/storage";
import { scoreNewsCandidate, MIN_SCORE_THRESHOLD } from "./news-scorer";
import { getMongoDatabase } from "@/lib/db/mongodb";

const MAX_SCORING_ATTEMPTS = 5; // Max news items to evaluate before giving up
const RECENT_TITLES_DAYS = 7; // Look-back window for the anti-repeat rule
const TRENDING_WINDOW_HOURS = 48; // How far back to look for viral videos
const TRENDING_VIEWS_THRESHOLD = 60000; // Views within the window that mark a "hit"

/**
 * Persons whose videos went viral in the last 48h ("hit sequels" lever).
 * One videos.list call per selection (~1 quota unit). Best-effort: any
 * failure returns [] and selection proceeds normally.
 */
export async function findTrendingPersons(
  userId: string,
  viewsThreshold = TRENDING_VIEWS_THRESHOLD
): Promise<string[]> {
  try {
    const db = await getMongoDatabase();
    const since = new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);
    const userQuery = ObjectId.isValid(userId)
      ? { _id: new ObjectId(userId) }
      : { googleId: userId };

    const docs = await db.collection("users").aggregate([
      { $match: userQuery },
      {
        $project: {
          youtubeSettings: 1,
          scheduledVideos: {
            $filter: {
              input: "$scheduledVideos",
              as: "v",
              cond: {
                $and: [
                  { $eq: ["$$v.language", "es"] },
                  { $eq: ["$$v.status", "published"] },
                  { $gte: ["$$v.publishedAt", since] },
                  { $ne: [{ $type: "$$v.youtubeVideoId" }, "missing"] },
                  { $ne: [{ $type: "$$v.newsId" }, "missing"] },
                ],
              },
            },
          },
        },
      },
    ]).toArray();

    const user = docs[0];
    const recent = (user?.scheduledVideos || []) as { youtubeVideoId: string; title: string }[];
    if (!recent.length || !user?.youtubeSettings?.accessToken) return [];

    const { createOAuth2Client, setEncryptedCredentials } = await import("@/lib/youtube/youtube-client");
    const { google } = await import("googleapis");
    const oauth = createOAuth2Client({
      clientId: user.youtubeSettings.clientId,
      clientSecret: user.youtubeSettings.clientSecret,
    } as any);
    setEncryptedCredentials(oauth, user.youtubeSettings.accessToken, user.youtubeSettings.refreshToken);
    const yt = google.youtube({ version: "v3", auth: oauth });

    const ids = recent.slice(0, 50).map((v) => v.youtubeVideoId);
    const res = await yt.videos.list({ id: ids, part: ["snippet", "statistics"] });

    const persons = new Set<string>();
    for (const item of res.data.items || []) {
      const views = Number(item.statistics?.viewCount || 0);
      if (views < viewsThreshold) continue;
      const m = (item.snippet?.title || "").match(/^[^A-Za-zÀ-ÿ]*(.+?)\s*\(\d+\)/);
      if (m) persons.add(m[1].trim());
    }

    if (persons.size) {
      console.log(`🔥 Trending persons (viral <${TRENDING_WINDOW_HOURS}h): ${[...persons].join(", ")}`);
    }
    return [...persons];
  } catch (error) {
    console.warn("findTrendingPersons failed (continuing without):", (error as Error).message);
    return [];
  }
}

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
export async function selectNextNews(userId?: string): Promise<StoredNewsCandidate | undefined> {
  console.log("Selecting next news candidate (with AI scoring)...");

  // Persons with a viral video in the last 48h — their follow-ups get a boost
  const trendingPersons = userId ? await findTrendingPersons(userId) : [];

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
    const score = await scoreNewsCandidate(news.title, news.summary, recentTitles, ageHours, trendingPersons);
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
