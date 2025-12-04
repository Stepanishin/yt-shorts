import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";

import {
  findJokeCandidateById,
  markJokeCandidateStatus,
  reserveNextJokeCandidate,
} from "@/lib/ingest/storage";
import { createVideoJob } from "@/lib/video/storage";
import { processVideoJob } from "@/lib/video/processor";

// Стоимость генерации (фон + аудио)
const BACKGROUND_COST = 25; // 25 кредитов за luma-direct
const AUDIO_COST = 10; // 10 кредитов за аудио
const TOTAL_COST = BACKGROUND_COST + AUDIO_COST; // 35 кредитов всего

export async function POST(request: Request) {
  try {
    // Проверяем аутентификацию
    const session = await auth();

    if (!session?.user?.id) {
      console.error("❌ No user session found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("✅ User authenticated:", { userId: session.user.id, email: session.user.email });

    // Получаем пользователя по Google ID
    const user = await getUserByGoogleId(session.user.id);
    console.log("👤 User found:", {
      googleId: session.user.id,
      mongoId: user?._id?.toString(),
      credits: user?.credits,
    });

    if (!user?._id) {
      console.error("❌ User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Проверяем баланс пользователя
    if ((user.credits || 0) < TOTAL_COST) {
      console.error("❌ Insufficient credits:", { current: user.credits, required: TOTAL_COST });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          requiredCredits: TOTAL_COST,
          currentCredits: user.credits || 0,
          message: `Недостаточно кредитов. Требуется: ${TOTAL_COST}, доступно: ${user.credits || 0}`,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log("✅ User has sufficient credits:", { current: user.credits, required: TOTAL_COST });

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
      editedText: candidate.editedText, // Используем editedText из анекдота, если он есть
      status: "pending",
    });

    // Запускаем обработку видео в фоне с userId для списания кредитов
    processVideoJob(job._id, user._id.toString()).catch((error) => {
      console.error("Failed to process video job in background", error);
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
