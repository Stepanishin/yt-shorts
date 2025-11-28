"use client";

import { useEffect, useState } from "react";
import { JokeCandidate } from "@/lib/ingest/types";
import JokeCard from "./JokeCard";

interface JokeListItem extends JokeCandidate {
  _id?: string;
  createdAt?: string;
  status?: "pending" | "reserved" | "used" | "rejected";
  reservedAt?: string;
  usedAt?: string;
  notes?: string;
}

export default function JokeList() {
  const [jokes, setJokes] = useState<JokeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<{
    totalCollected: number;
    inserted: number;
  } | null>(null);

  const [resetting, setResetting] = useState(false);

  const loadJokes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ingest/queue?limit=20");
      if (!response.ok) {
        throw new Error("Не удалось загрузить анекдоты");
      }
      const data = await response.json();
      setJokes(data.jokes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to load jokes:", err);
    } finally {
      setLoading(false);
    }
  };

  const collectJokes = async () => {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const response = await fetch("/api/ingest/run", {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось собрать анекдоты");
      }
      const result = await response.json();
      setCollectResult({
        totalCollected: result.totalCollected ?? 0,
        inserted: result.inserted ?? 0,
      });
      // Обновляем список после сбора
      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to collect jokes:", err);
    } finally {
      setCollecting(false);
    }
  };

  const resetReserved = async () => {
    setResetting(true);
    setError(null);
    try {
      const response = await fetch("/api/debug/reset-reserved", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Не удалось сбросить статусы");
      }

      const result = await response.json();
      console.log("Reset result:", result);

      // Обновляем список после сброса
      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to reset reserved:", err);
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    loadJokes();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Загрузка анекдотов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-red-800 font-medium mb-2">Ошибка загрузки</div>
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

  if (jokes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <div className="text-gray-600 mb-4">Анекдотов пока нет</div>
        <div className="text-sm text-gray-500 mb-6">
          Соберите анекдоты из различных источников
        </div>
        <button
          onClick={collectJokes}
          disabled={collecting}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed font-medium"
        >
          {collecting ? "Сбор анекдотов..." : "Собрать анекдоты"}
        </button>
        {collectResult && (
          <div className="mt-4 text-sm text-green-600">
            Собрано: {collectResult.totalCollected}, добавлено: {collectResult.inserted}
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Анекдоты ({jokes.length})
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

      {collectResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Собрано: {collectResult.totalCollected}, добавлено в базу: {collectResult.inserted}
        </div>
      )}
      <div className="grid gap-4">
        {jokes.map((joke) => (
          <JokeCard
            key={String(joke._id)}
            joke={joke}
          />
        ))}
      </div>
    </div>
  );
}

