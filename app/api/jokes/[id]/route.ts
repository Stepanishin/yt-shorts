import { NextResponse } from "next/server";
import { findJokeCandidateById, deleteJokeCandidate, updateJokeCandidateText } from "@/lib/ingest/storage";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { editedText } = body;

    if (typeof editedText !== "string") {
      return NextResponse.json({ error: "editedText must be a string" }, { status: 400 });
    }

    // Trim whitespace and validate that text is not empty
    const trimmedText = editedText.trim();
    if (!trimmedText) {
      return NextResponse.json(
        { error: "editedText cannot be empty or whitespace only" },
        { status: 400 }
      );
    }

    console.log(`PATCH request for joke ${id}, updating editedText (length: ${trimmedText.length})`);

    // Проверяем что анекдот существует
    const joke = await findJokeCandidateById(id);
    if (!joke) {
      return NextResponse.json({ error: "Joke not found" }, { status: 404 });
    }

    // Обновляем editedText (используем trimmed версию)
    await updateJokeCandidateText({ id, editedText: trimmedText });

    // Получаем обновленный анекдот
    const updatedJoke = await findJokeCandidateById(id);

    // Сериализуем данные для JSON
    const serialized = {
      ...updatedJoke,
      _id: updatedJoke?._id ? String(updatedJoke._id) : undefined,
      createdAt: updatedJoke?.createdAt ? new Date(updatedJoke.createdAt).toISOString() : undefined,
      reservedAt: updatedJoke?.reservedAt ? new Date(updatedJoke.reservedAt).toISOString() : undefined,
      usedAt: updatedJoke?.usedAt ? new Date(updatedJoke.usedAt).toISOString() : undefined,
    };

    console.log(`Joke ${id} editedText updated successfully`);

    return NextResponse.json({ success: true, joke: serialized });
  } catch (error) {
    console.error("Failed to update joke", error);
    return NextResponse.json({ error: "Failed to update joke" }, { status: 500 });
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
