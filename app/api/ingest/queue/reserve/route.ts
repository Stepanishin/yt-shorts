import { NextResponse } from "next/server";

import { reserveNextJokeCandidate } from "@/lib/ingest/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      language?: string;
      sources?: string[];
    };

    const allowedSources = Array.isArray(body.sources)
      ? (body.sources.filter((value) =>
          value === "chistes" || value === "yavendras" || value === "todochistes"
        ) as ("chistes" | "yavendras" | "todochistes")[])
      : undefined;

    const joke = await reserveNextJokeCandidate({
      language: body.language,
      sources: allowedSources,
    });

    if (!joke) {
      return NextResponse.json({ message: "No pending jokes available" }, { status: 404 });
    }

    return NextResponse.json({ joke });
  } catch (error) {
    console.error("Failed to reserve joke", error);
    return NextResponse.json({ error: "Failed to reserve joke" }, { status: 500 });
  }
}
