import { Collection, Document, ObjectId } from "mongodb";

import { getMongoDatabase } from "@/lib/db/mongodb";

import { JokeCandidate, JokeSource } from "./types";

const COLLECTION_NAME = "joke_candidates";
const INGEST_STATE_COLLECTION = "ingest_state";

export interface StoredJokeCandidate extends JokeCandidate {
  _id?: unknown;
  createdAt: Date;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  reservedAt?: Date;
  usedAt?: Date;
  deletedAt?: Date;
  notes?: string;
  editedText?: string; // Отредактированный текст пользователем
  youtubeVideoUrl?: string;
  youtubeVideoId?: string;
  publishedAt?: Date;
}

export const getJokeCandidateCollection = async (): Promise<
  Collection<StoredJokeCandidate & Document>
> => {
  const db = await getMongoDatabase();
  const collection = db.collection<StoredJokeCandidate>(COLLECTION_NAME);
  await ensureIndexes(collection);
  return collection;
};

const ensureIndexes = async (collection: Collection<StoredJokeCandidate>) => {
  await collection.createIndex({ source: 1, externalId: 1 }, { unique: false });
  await collection.createIndex({ source: 1, url: 1 }, { unique: false });
  await collection.createIndex({ createdAt: -1 });
};

// Максимальная длина текста анекдота для видео (основана на тестовом анекдоте)
const MAX_JOKE_TEXT_LENGTH = 257;

export const insertJokeCandidates = async (jokes: JokeCandidate[]) => {
  if (!jokes.length) {
    return { inserted: 0 };
  }

  const collection = await getJokeCandidateCollection();

  // Улучшенная проверка дубликатов: используем externalId или URL как fallback
  // Важно: проверяем ВСЕ статусы, включая "deleted", чтобы не добавлять дубликаты
  const existingJokes = await collection
    .find({
      $or: jokes.map((joke) => {
        // Если есть externalId, используем source + externalId
        if (joke.externalId) {
          return {
            source: joke.source,
            externalId: joke.externalId,
          };
        }
        // Если нет externalId, но есть URL, используем source + url
        if (joke.url) {
          return {
            source: joke.source,
            url: joke.url,
          };
        }
        // Fallback: используем только source + text (менее надежно)
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

  console.log(`Found ${existingKeys.size} existing jokes (including deleted)`);
  console.log(`Jokes with externalId: ${jokes.filter(j => j.externalId).length}, with URL: ${jokes.filter(j => j.url).length}, without both: ${jokes.filter(j => !j.externalId && !j.url).length}`);

  // Фильтруем только новые анекдоты
  const newJokes = jokes.filter((joke) => {
    if (joke.externalId) {
      return !existingKeys.has(`${joke.source}:${joke.externalId}`);
    }
    if (joke.url) {
      return !existingKeys.has(`${joke.source}:url:${joke.url}`);
    }
    return !existingKeys.has(`${joke.source}:text:${joke.text}`);
  });

  console.log(`Inserting ${newJokes.length} new jokes out of ${jokes.length} total`);
  if (newJokes.length < jokes.length) {
    console.log(`Filtered out ${jokes.length - newJokes.length} duplicate jokes`);
  }

  if (newJokes.length === 0) {
    return { inserted: 0 };
  }

  // Разделяем анекдоты на подходящие по длине и слишком длинные
  const validJokes: JokeCandidate[] = [];
  const tooLongJokes: JokeCandidate[] = [];

  for (const joke of newJokes) {
    if (joke.text.length > MAX_JOKE_TEXT_LENGTH) {
      tooLongJokes.push(joke);
    } else {
      validJokes.push(joke);
    }
  }

  console.log(`Valid jokes: ${validJokes.length}, Too long jokes: ${tooLongJokes.length}`);

  // Создаем документы для вставки
  const validDocuments = validJokes.map<Omit<StoredJokeCandidate, "_id">>((joke) => ({
    ...joke,
    createdAt: new Date(),
    status: "pending" as const,
  }));

  // Создаем документы для слишком длинных анекдотов (помечаем как deleted)
  const deletedDocuments = tooLongJokes.map<Omit<StoredJokeCandidate, "_id">>((joke) => ({
    ...joke,
    createdAt: new Date(),
    status: "deleted" as const,
    deletedAt: new Date(),
    notes: `Text too long: ${joke.text.length} chars (max ${MAX_JOKE_TEXT_LENGTH})`,
  }));

  // Объединяем все документы для вставки
  const allDocuments = [...validDocuments, ...deletedDocuments];

  if (allDocuments.length === 0) {
    return { inserted: 0 };
  }

  const result = await collection.insertMany(allDocuments, { ordered: false });
  console.log(`Inserted ${validDocuments.length} valid jokes and ${deletedDocuments.length} deleted (too long) jokes`);

  return { inserted: result.insertedCount };
};

export const findRecentJokeCandidates = async ({
  limit = 50,
}: {
  limit?: number;
}) => {
  const collection = await getJokeCandidateCollection();
  // Фильтруем анекдоты - показываем только pending и reserved, исключаем used, rejected и deleted
  const cursor = collection.find(
    {
      status: { $in: ["pending", "reserved", undefined] }
    },
    { sort: { createdAt: -1 }, limit }
  );
  return cursor.toArray();
};

export const findJokeCandidateById = async (id: unknown) => {
  const collection = await getJokeCandidateCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  return collection.findOne({ _id: objectId as ObjectId });
};

export const reserveNextJokeCandidate = async ({
  language = "es",
  sources,
}: {
  language?: string;
  sources?: JokeCandidate["source"][];
}) => {
  const collection = await getJokeCandidateCollection();

  const query: Record<string, unknown> = {
    status: { $in: [undefined, "pending"] },
  };

  if (language) {
    query.language = language;
  }

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
    sort: { ratingPercent: -1, createdAt: 1 },
    returnDocument: "after",
  });

  return result?.value ?? undefined;
};

export const markJokeCandidateStatus = async ({
  id,
  status,
  notes,
}: {
  id: unknown;
  status: "used" | "rejected" | "pending" | "reserved" | "deleted";
  notes?: string;
}) => {
  const collection = await getJokeCandidateCollection();

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

export const markJokeCandidateAsPublished = async ({
  id,
  youtubeVideoUrl,
  youtubeVideoId,
}: {
  id: unknown;
  youtubeVideoUrl: string;
  youtubeVideoId: string;
}) => {
  const collection = await getJokeCandidateCollection();

  const update = {
    status: "used" as const,
    usedAt: new Date(),
    publishedAt: new Date(),
    youtubeVideoUrl,
    youtubeVideoId,
  };

  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;
  await collection.updateOne({ _id: objectId as ObjectId }, { $set: update });
};

export const deleteJokeCandidate = async (id: unknown) => {
  console.log(`Deleting joke candidate ${id}`);
  await markJokeCandidateStatus({ id, status: "deleted", notes: "Deleted by user" });
  console.log(`Joke candidate ${id} marked as deleted`);
};

export const updateJokeCandidateText = async ({
  id,
  editedText,
}: {
  id: unknown;
  editedText: string;
}) => {
  const collection = await getJokeCandidateCollection();
  const objectId: ObjectId | unknown = ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id;

  await collection.updateOne(
    { _id: objectId as ObjectId },
    { $set: { editedText } }
  );

  console.log(`Updated editedText for joke ${id}`);
};

// ============ Ingest State Management ============

export interface IngestSourceState {
  source: JokeSource;
  sourceKey: string; // например "yavendras:chistes" или "todochistes:abogados"
  lastPage: number;
  lastFetchedAt: Date;
  totalFetched: number;
}

const getIngestStateCollection = async (): Promise<Collection<IngestSourceState & Document>> => {
  const db = await getMongoDatabase();
  const collection = db.collection<IngestSourceState>(INGEST_STATE_COLLECTION);
  await collection.createIndex({ source: 1, sourceKey: 1 }, { unique: true });
  return collection;
};

export const getNextPageForSource = async (
  source: JokeSource,
  sourceKey: string
): Promise<number> => {
  const collection = await getIngestStateCollection();
  const state = await collection.findOne({ source, sourceKey });

  if (!state) {
    return 1; // Первая страница
  }

  return state.lastPage + 1;
};

export const updateSourceState = async (
  source: JokeSource,
  sourceKey: string,
  page: number,
  fetchedCount: number
) => {
  const collection = await getIngestStateCollection();

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

  console.log(`Updated state for ${source}:${sourceKey} - page ${page}, fetched ${fetchedCount}`);
};

