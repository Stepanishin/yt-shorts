"use client";

import { useEffect, useState } from "react";
import { JokeCandidateDE } from "@/lib/ingest-de/types";
import JokeCardDE from "./JokeCardDE";

interface JokeListItemDE extends JokeCandidateDE {
  _id?: string;
  createdAt?: string;
  status?: "pending" | "reserved" | "used" | "rejected";
  reservedAt?: string;
  usedAt?: string;
  notes?: string;
}

export default function JokeListDE() {
  const [jokes, setJokes] = useState<JokeListItemDE[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<{
    totalCollected: number;
    inserted: number;
  } | null>(null);

  const loadJokes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ingest-de/queue?limit=100");
      if (!response.ok) {
        throw new Error("[DE] Не удалось загрузить немецкие анекдоты");
      }
      const data = await response.json();
      setJokes(data.jokes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[DE] Failed to load jokes:", err);
    } finally {
      setLoading(false);
    }
  };

  const collectJokes = async () => {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const response = await fetch("/api/ingest-de/run", {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "[DE] Не удалось собрать немецкие анекдоты");
      }
      const result = await response.json();
      setCollectResult({
        totalCollected: result.totalCollected ?? 0,
        inserted: result.inserted ?? 0,
      });
      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[DE] Failed to collect jokes:", err);
    } finally {
      setCollecting(false);
    }
  };

  useEffect(() => {
    loadJokes();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Загрузка немецких анекдотов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-red-800 font-medium mb-2">Ошибка</div>
        <div className="text-red-600 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-gray-600">
          Всего немецких анекдотов: <span className="font-semibold">{jokes.length}</span>
        </div>
        <button
          onClick={collectJokes}
          disabled={collecting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
        >
          {collecting ? "Сбор немецких анекдотов..." : "🇩🇪 Собрать немецкие анекдоты"}
        </button>
      </div>

      {collectResult && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="font-medium mb-2 text-green-800">Сбор завершен!</div>
          <div className="text-sm text-green-600">
            Собрано: {collectResult.totalCollected}, Добавлено новых: {collectResult.inserted}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jokes.map((joke) => (
          <JokeCardDE key={joke._id} joke={joke} />
        ))}
      </div>

      {jokes.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Нет доступных немецких анекдотов. Нажмите &quot;Собрать немецкие анекдоты&quot; чтобы загрузить.
        </div>
      )}
    </div>
  );
}
