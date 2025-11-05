import { NextResponse } from "next/server";
import { findJokeCandidateById, deleteJokeCandidate } from "@/lib/ingest/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const joke = await findJokeCandidateById(id);

    if (!joke) {
      return NextResponse.json({ error: "Joke not found" }, { status: 404 });
    }

    // Сериализуем данные для JSON
    const serialized = {
      ...joke,
      _id: joke._id ? String(joke._id) : undefined,
      createdAt: joke.createdAt ? new Date(joke.createdAt).toISOString() : undefined,
      reservedAt: joke.reservedAt ? new Date(joke.reservedAt).toISOString() : undefined,
      usedAt: joke.usedAt ? new Date(joke.usedAt).toISOString() : undefined,
    };

    return NextResponse.json({ joke: serialized });
  } catch (error) {
    console.error("Failed to load joke", error);
    return NextResponse.json({ error: "Failed to load joke" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    console.log(`DELETE request for joke ${id}`);

    // Проверяем что анекдот существует
    const joke = await findJokeCandidateById(id);
    if (!joke) {
      return NextResponse.json({ error: "Joke not found" }, { status: 404 });
    }

    // Помечаем анекдот как удаленный
    await deleteJokeCandidate(id);

    console.log(`Joke ${id} deleted successfully`);

    return NextResponse.json({ success: true, message: "Joke deleted successfully" });
  } catch (error) {
    console.error("Failed to delete joke", error);
    return NextResponse.json({ error: "Failed to delete joke" }, { status: 500 });
  }
}
