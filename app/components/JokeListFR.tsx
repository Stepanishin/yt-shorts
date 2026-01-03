"use client";

import { useEffect, useState } from "react";
import { JokeCandidateFR } from "@/lib/ingest-fr/types";
import JokeCardFR from "./JokeCardFR";

interface JokeListItemFR extends JokeCandidateFR {
  _id?: string;
  createdAt?: string;
  status?: "pending" | "reserved" | "used" | "rejected";
  reservedAt?: string;
  usedAt?: string;
  notes?: string;
}

export default function JokeListFR() {
  const [jokes, setJokes] = useState<JokeListItemFR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<{
    totalCollected: number;
    inserted: number;
  } | null>(null);

  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [cleaningLongJokes, setCleaningLongJokes] = useState(false);
  const [cleaningLongJokes600, setCleaningLongJokes600] = useState(false);
  const [cleaningLongJokes650, setCleaningLongJokes650] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    cleaned: number;
    found: number;
  } | null>(null);

  const loadJokes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ingest-fr/queue?limit=100");
      if (!response.ok) {
        throw new Error("[FR] Не удалось загрузить французские анекдоты");
      }
      const data = await response.json();
      setJokes(data.jokes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[FR] Failed to load jokes:", err);
    } finally {
      setLoading(false);
    }
  };

  const collectJokes = async () => {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const response = await fetch("/api/ingest-fr/run", {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "[FR] Не удалось собрать французские анекдоты");
      }
      const result = await response.json();
      setCollectResult({
        totalCollected: result.totalCollected ?? 0,
        inserted: result.inserted ?? 0,
      });
      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[FR] Failed to collect jokes:", err);
    } finally {
      setCollecting(false);
    }
  };

  const cleanupLongJokes = async () => {
    if (!confirm("Вы уверены? Это пометит все pending французские анекдоты длиннее 500 символов как deleted.")) {
      return;
    }

    setCleaningLongJokes(true);
    setError(null);
    setCleanupResult(null);
    try {
      const response = await fetch("/api/debug-fr/cleanup-long-jokes", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("[FR] Не удалось очистить длинные анекдоты");
      }

      const result = await response.json();
      console.log("[FR] Cleanup result:", result);
      setCleanupResult({
        cleaned: result.cleaned,
        found: result.found,
      });

      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[FR] Failed to cleanup long jokes:", err);
    } finally {
      setCleaningLongJokes(false);
    }
  };

  const cleanupLongJokes600 = async () => {
    if (!confirm("Вы уверены? Это пометит все pending французские анекдоты длиннее 600 символов как deleted.")) {
      return;
    }

    setCleaningLongJokes600(true);
    setError(null);
    setCleanupResult(null);
    try {
      const response = await fetch("/api/debug-fr/cleanup-long-jokes-600", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("[FR] Не удалось очистить длинные анекдоты");
      }

      const result = await response.json();
      console.log("[FR] Cleanup result:", result);
      setCleanupResult({
        cleaned: result.cleaned,
        found: result.found,
      });

      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[FR] Failed to cleanup long jokes:", err);
    } finally {
      setCleaningLongJokes600(false);
    }
  };

  const cleanupLongJokes650 = async () => {
    if (!confirm("Вы уверены? Это пометит все pending французские анекдоты длиннее 650 символов как deleted.")) {
      return;
    }

    setCleaningLongJokes650(true);
    setError(null);
    setCleanupResult(null);
    try {
      const response = await fetch("/api/debug-fr/cleanup-long-jokes-650", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("[FR] Не удалось очистить длинные анекдоты");
      }

      const result = await response.json();
      console.log("[FR] Cleanup result:", result);
      setCleanupResult({
        cleaned: result.cleaned,
        found: result.found,
      });

      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[FR] Failed to cleanup long jokes:", err);
    } finally {
      setCleaningLongJokes650(false);
    }
  };

  useEffect(() => {
    loadJokes();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Загрузка португальских анекдотов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-red-800 font-medium mb-2">Ошибка</div>
        <div className="text-red-600 text-sm mb-3">{error}</div>
        <button
          onClick={loadJokes}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  // Filter jokes based on toggle
  const filteredJokes = showOnlyPending
    ? jokes.filter(joke => !joke.status || joke.status === "pending")
    : jokes;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          🇫🇷 Французские анекдоты ({filteredJokes.length} {showOnlyPending && `из ${jokes.length}`})
        </h2>
        <div className="flex gap-2">
          <button
            onClick={collectJokes}
            disabled={collecting}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm disabled:bg-green-400 disabled:cursor-not-allowed"
          >
            {collecting ? "Сбор..." : "Собрать анекдоты"}
          </button>
          <button
            onClick={loadJokes}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            Обновить
          </button>
        </div>
      </div>

      {/* Toggle for showing only pending jokes */}
      <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyPending}
            onChange={(e) => setShowOnlyPending(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-900">
            Показать только pending
          </span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={cleanupLongJokes}
            disabled={cleaningLongJokes}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors text-sm disabled:bg-orange-400 disabled:cursor-not-allowed"
          >
            {cleaningLongJokes ? "Очистка..." : "Удалить длинные (>500)"}
          </button>
          <button
            onClick={cleanupLongJokes600}
            disabled={cleaningLongJokes600}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors text-sm disabled:bg-orange-400 disabled:cursor-not-allowed"
          >
            {cleaningLongJokes600 ? "Очистка..." : "Удалить длинные (>600)"}
          </button>
          <button
            onClick={cleanupLongJokes650}
            disabled={cleaningLongJokes650}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors text-sm disabled:bg-orange-400 disabled:cursor-not-allowed"
          >
            {cleaningLongJokes650 ? "Очистка..." : "Удалить длинные (>650)"}
          </button>
        </div>
      </div>

      {cleanupResult && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
          Найдено: {cleanupResult.found}, помечено как deleted: {cleanupResult.cleaned}
        </div>
      )}

      {collectResult && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          Собрано: {collectResult.totalCollected}, добавлено в базу: {collectResult.inserted}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredJokes.map((joke) => (
          <JokeCardFR key={joke._id} joke={joke} />
        ))}
      </div>

      {filteredJokes.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Нет доступных португальских анекдотов. Нажмите &quot;Собрать анекдоты&quot; чтобы загрузить.
        </div>
      )}
    </div>
  );
}
