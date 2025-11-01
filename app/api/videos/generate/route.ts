import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import {
  findJokeCandidateById,
  markJokeCandidateStatus,
  reserveNextJokeCandidate,
} from "@/lib/ingest/storage";
import { createVideoJob } from "@/lib/video/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      jokeId?: string;
      language?: string;
      sources?: string[];
    };

    const allowedSources = Array.isArray(body.sources)
      ? (body.sources.filter((value) =>
          value === "chistes" || value === "yavendras" || value === "todochistes"
        ) as ("chistes" | "yavendras" | "todochistes")[])
      : undefined;

    const candidate = body.jokeId
      ? await reserveSpecificJoke(body.jokeId)
      : await reserveNextJokeCandidate({ language: body.language, sources: allowedSources });

    if (!candidate) {
      return NextResponse.json({ message: "No joke available for generation" }, { status: 404 });
    }

    const job = await createVideoJob({
      jokeId: candidate._id ?? candidate.externalId ?? new ObjectId().toString(),
      jokeSource: candidate.source,
      jokeText: candidate.text,
      jokeTitle: candidate.title,
      jokeMeta: candidate.meta,
      status: "pending",
    });

    return NextResponse.json({ job, joke: candidate });
  } catch (error) {
    console.error("Failed to create video job", error);
    return NextResponse.json({ error: "Failed to create video job" }, { status: 500 });
  }
}

const reserveSpecificJoke = async (id: string) => {
  const objectId = ObjectId.isValid(id) ? new ObjectId(id) : id;
  const existing = await findJokeCandidateById(objectId);

  if (!existing) {
    return undefined;
  }

  if (existing.status !== "reserved") {
    await markJokeCandidateStatus({ id: objectId, status: "reserved" });
  }

  return {
    ...existing,
    status: "reserved" as const,
  };
};
