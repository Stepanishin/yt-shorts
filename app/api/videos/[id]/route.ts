import { NextResponse } from "next/server";
import { findVideoJobById, updateVideoJobStatus } from "@/lib/video/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const job = await findVideoJobById(id);

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
      editedText: job.editedText,
      finalVideoUrl: job.finalVideoUrl,
      renderingStatus: job.renderingStatus,
    };

    return NextResponse.json({ job: serialized });
  } catch (error) {
    console.error("Failed to load video job", error);
    return NextResponse.json({ error: "Failed to load video job" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { editedText, renderingStatus } = body as { 
      editedText?: string;
      renderingStatus?: "pending" | "running" | "completed" | "failed";
    };

    // Нужно хотя бы одно поле для обновления
    if (editedText === undefined && renderingStatus === undefined) {
      return NextResponse.json({ error: "Either editedText or renderingStatus is required" }, { status: 400 });
    }

    const job = await findVideoJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Video job not found" }, { status: 404 });
    }

    await updateVideoJobStatus({
      id,
      status: job.status,
      editedText,
      renderingStatus,
    });

    // Получаем обновленную джобу
    const updatedJob = await findVideoJobById(id);

    const serialized = {
      ...updatedJob!,
      _id: updatedJob!._id ? String(updatedJob!._id) : undefined,
      jokeId: updatedJob!.jokeId ? String(updatedJob!.jokeId) : undefined,
      createdAt: updatedJob!.createdAt ? new Date(updatedJob!.createdAt).toISOString() : undefined,
      updatedAt: updatedJob!.updatedAt ? new Date(updatedJob!.updatedAt).toISOString() : undefined,
      backgroundVideoUrl: updatedJob!.backgroundVideoUrl,
      backgroundPrompt: updatedJob!.backgroundPrompt,
      editedText: updatedJob!.editedText,
      finalVideoUrl: updatedJob!.finalVideoUrl,
      renderingStatus: updatedJob!.renderingStatus,
    };

    return NextResponse.json({ job: serialized });
  } catch (error) {
    console.error("Failed to update video job", error);
    return NextResponse.json({ error: "Failed to update video job" }, { status: 500 });
  }
}

