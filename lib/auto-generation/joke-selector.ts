import { getJokeCandidateCollection } from "@/lib/ingest/storage";
import type { StoredJokeCandidate } from "@/lib/ingest/storage";
import { getJokeCandidateCollectionDE } from "@/lib/ingest-de/storage";
import type { StoredJokeCandidateDE } from "@/lib/ingest-de/storage";

/**
 * Select next available joke for auto-generation (Spanish)
 * Returns a joke with status 'pending', marks it as 'reserved'
 */
export async function selectNextJoke(): Promise<StoredJokeCandidate | null> {
  try {
    const collection = await getJokeCandidateCollection();

    // Debug: Check what jokes are actually available
    const anyJoke = await collection.findOne({});
    console.log("Sample joke from DB:", {
      id: anyJoke?._id,
      status: anyJoke?.status,
      language: anyJoke?.language,
      hasText: !!anyJoke?.text,
    });

    // Direct MongoDB query - simpler approach
    console.log("Trying to reserve joke directly from MongoDB...");

    const query = {
      status: { $in: ["pending", null] as any },
    };

    console.log("Query:", JSON.stringify(query));

    // Find and update in one atomic operation
    const result = await collection.findOneAndUpdate(
      query,
      {
        $set: {
          status: "reserved",
          reservedAt: new Date(),
        },
      },
      {
        sort: { createdAt: 1 }, // Oldest first
        returnDocument: "after",
      }
    );

    console.log("FindOneAndUpdate result type:", typeof result);
    console.log("FindOneAndUpdate result keys:", result ? Object.keys(result) : "null");
    console.log("FindOneAndUpdate result:", {
      found: !!result,
      hasValue: !!result?.value,
      hasOk: !!(result as any)?.ok,
      directResult: !!result,
      id: result?.value?._id || (result as any)?._id,
    });

    // Try different ways to access the result
    const joke = result?.value || (result as any) || result;

    if (!joke) {
      console.warn("No jokes available for auto-generation");
      return null;
    }

    console.log(`Selected joke: ${joke._id} - "${joke.text.substring(0, 50)}..."`);

    return joke;
  } catch (error) {
    console.error("Error selecting joke:", error);
    throw error;
  }
}

/**
 * Get count of available jokes for auto-generation (Spanish)
 */
export async function getAvailableJokesCount(): Promise<number> {
  try {
    const { getJokeCandidateCollection } = await import("@/lib/ingest/storage");
    const collection = await getJokeCandidateCollection();

    const count = await collection.countDocuments({
      status: { $in: ["pending", undefined] },
    });

    return count;
  } catch (error) {
    console.error("Error counting available jokes:", error);
    return 0;
  }
}

/**
 * Select next available German joke for auto-generation
 * Returns a joke with status 'pending', marks it as 'reserved'
 */
export async function selectNextJokeDE(): Promise<StoredJokeCandidateDE | null> {
  try {
    const collection = await getJokeCandidateCollectionDE();

    // Debug: Check what jokes are actually available
    const anyJoke = await collection.findOne({});
    console.log("[DE] Sample joke from DB:", {
      id: anyJoke?._id,
      status: anyJoke?.status,
      language: anyJoke?.language,
      hasText: !!anyJoke?.text,
    });

    // Direct MongoDB query - simpler approach
    console.log("[DE] Trying to reserve joke directly from MongoDB...");

    const query = {
      status: { $in: ["pending", null] as any },
      language: "de",
    };

    console.log("[DE] Query:", JSON.stringify(query));

    // Find and update in one atomic operation
    const result = await collection.findOneAndUpdate(
      query,
      {
        $set: {
          status: "reserved",
          reservedAt: new Date(),
        },
      },
      {
        sort: { createdAt: 1 }, // Oldest first
        returnDocument: "after",
      }
    );

    console.log("[DE] FindOneAndUpdate result type:", typeof result);
    console.log("[DE] FindOneAndUpdate result keys:", result ? Object.keys(result) : "null");
    console.log("[DE] FindOneAndUpdate result:", {
      found: !!result,
      hasValue: !!result?.value,
      hasOk: !!(result as any)?.ok,
      directResult: !!result,
      id: result?.value?._id || (result as any)?._id,
    });

    // Try different ways to access the result
    const joke = result?.value || (result as any) || result;

    if (!joke) {
      console.warn("[DE] No jokes available for auto-generation");
      return null;
    }

    console.log(`[DE] Selected joke: ${joke._id} - "${joke.text.substring(0, 50)}..."`);

    return joke;
  } catch (error) {
    console.error("[DE] Error selecting joke:", error);
    throw error;
  }
}

/**
 * Get count of available German jokes for auto-generation
 */
export async function getAvailableJokesCountDE(): Promise<number> {
  try {
    const collection = await getJokeCandidateCollectionDE();

    const count = await collection.countDocuments({
      status: { $in: ["pending", undefined] },
      language: "de",
    });

    return count;
  } catch (error) {
    console.error("[DE] Error counting available jokes:", error);
    return 0;
  }
}
