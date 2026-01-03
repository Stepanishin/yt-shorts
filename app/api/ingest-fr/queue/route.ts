import { NextResponse } from "next/server";
import { findRecentJokeCandidatesFR } from "@/lib/ingest-fr/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 50;

    const jokes = await findRecentJokeCandidatesFR({ limit });
    return NextResponse.json({ jokes });
  } catch (error) {
    console.error("[FR] Failed to fetch jokes queue", error);
    return NextResponse.json({ error: "[FR] Failed to fetch jokes" }, { status: 500 });
  }
}
