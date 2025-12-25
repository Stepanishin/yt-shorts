import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { JokeCandidatePT, JokeSourcePT } from "./types";

const COLLECTION_NAME = "joke_candidates_pt";
const INGEST_STATE_COLLECTION = "ingest_state_pt";

export interface StoredJokeCandidatePT extends JokeCandidatePT {
  _id?: unknown;
  createdAt: Date;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  reservedAt?: Date;
  usedAt?: Date;
  deletedAt?: Date;
  notes?: string;
  editedText?: string; // User-edited text
  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
  publishedAt?: Date;
}

export const getJokeCandidateCollectionPT = async (): Promise<
  Collection<StoredJokeCandidatePT & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredJokeCandidatePT>(COLLECTION_NAME);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredJokeCandidatePT>) => {
  await collection.createIndex({ source: 1, externalId: 1 }, { unique: false });
  await collection.createIndex({ source: 1, url: 1 }, { unique: false });
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ language: 1 });
};

// Maximum joke text length for video (based on test joke)
const MAX_JOKE_TEXT_LENGTH = 600;

export const insertJokeCandidatesPT = async (jokes: JokeCandidatePT[]) => {
  if (!jokes.length) {
    return { inserted: 0 };
  }

  const collection = await getJokeCandidateCollectionPT();

  // Check for duplicates: use externalId or URL as fallback
  // Important: check ALL statuses including "deleted" to avoid duplicates
  const existingJokes = await collection
    .find({
      $or: jokes.map((joke) => {
        // If has externalId, use source + externalId
        if (joke.externalId) {
          return {
            source: joke.source,
            externalId: joke.externalId,
          };
        }
        // If no externalId but has URL, use source + url
        if (joke.url) {
          return {
            source: joke.source,
            url: joke.url,
          };
        }
        // Fallback: use only source + text (less reliable)
        return {
          source: joke.source,
          text: joke.text,
        };
      }),
    })
    .toArray();

  const existingKeys = new Set(
    existingJokes.map((joke) => {
      if (joke.externalId) {
        return `${joke.source}:${joke.externalId}`;
      }
      if (joke.url) {
        return `${joke.source}:url:${joke.url}`;
      }
      return `${joke.source}:text:${joke.text}`;
    })
  );

  console.log(`[PT] Found ${existingKeys.size} existing jokes (including deleted)`);
  console.log(`[PT] Jokes with externalId: ${jokes.filter(j => j.externalId).length}, with URL: ${jokes.filter(j => j.url).length}, without both: ${jokes.filter(j => !j.externalId && !j.url).length}`);

  // Filter only new jokes
  const newJokes = jokes.filter((joke) => {
    if (joke.externalId) {
      return !existingKeys.has(`${joke.source}:${joke.externalId}`);
    }
    if (joke.url) {
      return !existingKeys.has(`${joke.source}:url:${joke.url}`);
    }
    return !existingKeys.has(`${joke.source}:text:${joke.text}`);
  });

  console.log(`[PT] Inserting ${newJokes.length} new jokes out of ${jokes.length} total`);
  if (newJokes.length < jokes.length) {
    console.log(`[PT] Filtered out ${jokes.length - newJokes.length} duplicate jokes`);
  }

  if (newJokes.length === 0) {
    return { inserted: 0 };
  }

  // Separate jokes by length
  const validJokes: JokeCandidatePT[] = [];
  const tooLongJokes: JokeCandidatePT[] = [];

  for (const joke of newJokes) {
    if (joke.text.length > MAX_JOKE_TEXT_LENGTH) {
      tooLongJokes.push(joke);
    } else {
      validJokes.push(joke);
    }
  }

  console.log(`[PT] Valid jokes: ${validJokes.length}, Too long jokes: ${tooLongJokes.length}`);

  // Create documents for insertion
  const validDocuments = validJokes.map<Omit<StoredJokeCandidatePT, "_id">>((joke) => ({
    ...joke,
    createdAt: new Date(),
    status: "pending" as const,
  }));

  // Create documents for too long jokes (mark as deleted)
  const deletedDocuments = tooLongJokes.map<Omit<StoredJokeCandidatePT, "_id">>((joke) => ({
    ...joke,
    createdAt: new Date(),
    status: "deleted" as const,
    deletedAt: new Date(),
    notes: `Text too long: ${joke.text.length} chars (max ${MAX_JOKE_TEXT_LENGTH})`,
  }));

  // Combine all documents for insertion
  const allDocuments = [...validDocuments, ...deletedDocuments];

  if (allDocuments.length === 0) {
    return { inserted: 0 };
  }

  const result = await collection.insertMany(allDocuments, { ordered: false });
  console.log(`[PT] Inserted ${validDocuments.length} valid jokes and ${deletedDocuments.length} deleted (too long) jokes`);

  return { inserted: result.insertedCount };
};

export const findRecentJokeCandidatesPT = async ({
  limit = 50,
}: {
  limit?: number;
}) => {
  const collection = await getJokeCandidateCollectionPT();
  // Filter jokes - show only pending and reserved, exclude used, rejected and deleted
  const cursor = collection.find(
    {
      status: { $in: ["pending", "reserved", undefined] }
    },
    { sort: { createdAt: -1 }, limit }
  );
  return cursor.toArray();
};

export const findJokeCandidateByIdPT = async (id: unknown) => {
  const collection = await getJokeCandidateCollectionPT();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

export const reserveNextJokeCandidatePT = async ({
  sources,
}: {
  sources?: JokeCandidatePT["source"][];
}) => {
  const collection = await getJokeCandidateCollectionPT();

  const query: Record<string, unknown> = {
    status: { $in: [undefined, "pending"] },
    language: "de",
  };

  if (sources && sources.length > 0) {
    query.source = { $in: sources };
  }

  const update = {
    $set: {
      status: "reserved" as const,
      reservedAt: new Date(),
    },
  };

  const result = await collection.findOneAndUpdate(query, update, {
    sort: { createdAt: 1 },
    returnDocument: "after",
  });

  return result?.value ?? undefined;
};

export const markJokeCandidateStatusPT = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "used" | "rejected" | "pending" | "reserved" | "deleted";
  notes?: string;
}) => {
  const collection = await getJokeCandidateCollectionPT();

  const update: Record<string, unknown> = {
    status,
    notes,
  };

  if (status === "used") {
    update.usedAt = new Date();
    update.reservedAt = update.reservedAt ?? new Date();
  }

  if (status === "pending") {
    update.reservedAt = undefined;
  }

  if (status === "reserved") {
    update.reservedAt = new Date();
  }

  if (status === "deleted") {
    update.deletedAt = new Date();
  }

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

export const markJokeCandidateAsPublishedPT = async ({
  id,
  youtubeVideoUrl,
  youtubeVideoId,
}: {
  id: unknown;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}) => {
  const collection = await getJokeCandidateCollectionPT();

  const update = {
    status: "used" as const,
    usedAt: new Date(),
    publishedAt: new Date(),
    youtubeVideoUrl,
    youtubeVideoId,
  };

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  console.log(`[PT] Marking joke ${id} (ObjectId: ${objectId}) as published`);

  const result = await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });

  if (result.matchedCount === 0) {
    throw new Error(`[PT] Joke with id ${id} not found in database`);
  }

  if (result.modifiedCount === 0) {
    console.warn(`[PT] Joke ${id} was found but not modified (might already be marked as used)`);
  } else {
    console.log(`[PT] Successfully marked joke ${id} as used and published`);
  }

  return result;
};

export const deleteJokeCandidatePT = async (id: unknown) => {
  console.log(`[PT] Deleting joke candidate ${id}`);
  await markJokeCandidateStatusPT({ id, status: "deleted", notes: "Deleted by user" });
  console.log(`[PT] Joke candidate ${id} marked as deleted`);
};

export const updateJokeCandidateTextPT = async ({
  id,
  editedText,
}: {
  id: unknown;
  editedText: string;
}) => {
  const collection = await getJokeCandidateCollectionPT();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  await collection.updateOne(
    { _id: objectId as ObjectId },
    { $set: { editedText } }
  );

  console.log(`[PT] Updated editedText for joke ${id}`);
};

// ============ Ingest State Management ============

export interface IngestSourceStatePT {
  source: JokeSourcePT;
  sourceKey: string; // e.g., "jokeapi:Programming" or "aberwitzig:flachwitze"
  lastPage: number;
  lastFetchedAt: Date;
  totalFetched: number;
}

const getIngestStateCollectionPT = async (): Promise<Collection<IngestSourceStatePT & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<IngestSourceStatePT>(INGEST_STATE_COLLECTION);
  await collection.createIndex({ source: 1, sourceKey: 1 }, { unique: true });
  return collection;
};

export const getNextPageForSourcePT = async (
  source: JokeSourcePT,
  sourceKey: string
): Promise<number> => {
  const collection = await getIngestStateCollectionPT();
  const state = await collection.findOne({ source, sourceKey });

  if (!state) {
    return 1; // First page
  }

  return state.lastPage + 1;
};

export const updateSourceStatePT = async (
  source: JokeSourcePT,
  sourceKey: string,
  page: number,
  fetchedCount: number
) => {
  const collection = await getIngestStateCollectionPT();

  await collection.updateOne(
    { source, sourceKey },
    {
      $set: {
        lastPage: page,
        lastFetchedAt: new Date(),
      },
      $inc: {
        totalFetched: fetchedCount,
      },
      $setOnInsert: {
        source,
        sourceKey,
      },
    },
    { upsert: true }
  );

  console.log(`[PT] Updated state for ${source}:${sourceKey} - page ${page}, fetched ${fetchedCount}`);
};
