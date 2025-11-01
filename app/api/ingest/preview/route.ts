import { NextResponse } from "next/server";

import { insertJokeCandidates } from "@/lib/ingest/storage";
import { JokeCandidate } from "@/lib/ingest/types";

const MAX_JOKES_PER_REQUEST = 50;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const jokes = normalizeJokes(payload);

    if (!jokes.length) {
      return NextResponse.json(
        { error: "No jokes provided. Expecting non-empty array under 'jokes'." },
        { status: 400 }
      );
    }

    if (jokes.length > MAX_JOKES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many jokes. Maximum allowed per request is ${MAX_JOKES_PER_REQUEST}.` },
        { status: 400 }
      );
    }

    const { inserted } = await insertJokeCandidates(jokes);

    return NextResponse.json({ inserted });
  } catch (error) {
    console.error("Failed to persist joke preview", error);
    return NextResponse.json({ error: "Failed to save jokes" }, { status: 500 });
  }
}

const normalizeJokes = (payload: unknown): JokeCandidate[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const jokes = Array.isArray(record.jokes) ? record.jokes : Array.isArray(payload) ? payload : [];

  return jokes
    .map((item) => normalizeJoke(item))
    .filter((joke): joke is JokeCandidate => Boolean(joke));
};

const normalizeJoke = (input: unknown): JokeCandidate | undefined => {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;

  const source = record.source;
  const text = record.text;
  const language = record.language ?? "es";

  if (typeof source !== "string" || typeof text !== "string" || !text.trim()) {
    return undefined;
  }

  if (source !== "chistes" && source !== "yavendras" && source !== "todochistes") {
    return undefined;
  }

  return {
    source,
    text: text.trim(),
    language: typeof language === "string" ? language : "es",
    title: typeof record.title === "string" ? record.title.trim() : undefined,
    rawHtml: typeof record.rawHtml === "string" ? record.rawHtml : undefined,
    externalId: typeof record.externalId === "string" ? record.externalId : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
    category: typeof record.category === "string" ? record.category : undefined,
    ratingPercent: typeof record.ratingPercent === "number" ? record.ratingPercent : undefined,
    votesTotal: typeof record.votesTotal === "number" ? record.votesTotal : undefined,
    votesPositive: typeof record.votesPositive === "number" ? record.votesPositive : undefined,
    votesNegative: typeof record.votesNegative === "number" ? record.votesNegative : undefined,
    meta: isPlainObject(record.meta) ? (record.meta as Record<string, unknown>) : undefined,
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

