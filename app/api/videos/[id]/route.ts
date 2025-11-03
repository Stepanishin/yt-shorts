import { NextResponse } from "next/server";
import { listVideoJobs } from "@/lib/video/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const jobs = await listVideoJobs({ limit: 100 });
    const job = jobs.find((j) => String(j._id) === id);

    if (!job) {
      return NextResponse.json({ error: "Video job not found" }, { status: 404 });
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
    console.error("Failed to load video job", error);
    return NextResponse.json({ error: "Failed to load video job" }, { status: 500 });
  }
}

