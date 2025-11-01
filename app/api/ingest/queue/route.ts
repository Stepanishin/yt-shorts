import { NextResponse } from "next/server";

import { findRecentJokeCandidates } from "@/lib/ingest/storage";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limitCandidate = limitParam ? Number(limitParam) : undefined;
    const limit = sanitizeLimit(limitCandidate);

    const jokes = await findRecentJokeCandidates({ limit });

    // Сериализуем данные для JSON (MongoDB ObjectId и Date автоматически конвертируются)
    const serialized = jokes.map((joke) => ({
      ...joke,
      _id: joke._id ? String(joke._id) : undefined,
      createdAt: joke.createdAt ? new Date(joke.createdAt).toISOString() : undefined,
      reservedAt: joke.reservedAt ? new Date(joke.reservedAt).toISOString() : undefined,
      usedAt: joke.usedAt ? new Date(joke.usedAt).toISOString() : undefined,
    }));

    return NextResponse.json({ jokes: serialized, limit });
  } catch (error) {
    console.error("Failed to load ingest queue", error);
    return NextResponse.json({ error: "Failed to load queue" }, { status: 500 });
  }
}

const sanitizeLimit = (value: number | undefined): number => {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIMIT);
};

