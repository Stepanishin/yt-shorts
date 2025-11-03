import { NextResponse } from "next/server";
import { findVideoJobByJokeId } from "@/lib/video/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jokeId: string }> }
) {
  try {
    const { jokeId } = await params;
    if (!jokeId) {
      return NextResponse.json({ error: "Joke ID is required" }, { status: 400 });
    }

    const job = await findVideoJobByJokeId(jokeId);

    if (!job) {
      return NextResponse.json({ job: null });
    }

    // Сериализуем данные для JSON
    const serialized = {
      ...job,
      _id: job._id ? String(job._id) : undefined,
      jokeId: job.jokeId ? String(job.jokeId) : undefined,
      createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
      updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : undefined,
      backgroundVideoUrl: job.backgroundVideoUrl,
      backgroundPrompt: job.backgroundPrompt,
    };

    return NextResponse.json({ job: serialized });
  } catch (error) {
    console.error("Failed to load video job by joke ID", error);
    return NextResponse.json({ error: "Failed to load video job" }, { status: 500 });
  }
}

