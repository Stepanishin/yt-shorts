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

  // Состояния для массовой обработки
  const [batchCount, setBatchCount] = useState(1);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    results: any[];
    errors: any[];
  } | null>(null);
  const [resetting, setResetting] = useState(false);

  // Режим выбора и выбранные анекдоты
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJokes, setSelectedJokes] = useState<Set<string>>(new Set());

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

  const toggleJokeSelection = (jokeId: string) => {
    setSelectedJokes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jokeId)) {
        newSet.delete(jokeId);
      } else {
        newSet.add(jokeId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    const allIds = new Set(jokes.map((j) => String(j._id)).filter(Boolean));
    setSelectedJokes(allIds);
  };

  const deselectAll = () => {
    setSelectedJokes(new Set());
  };

  const processBatch = async () => {
    // Если включен режим выбора - обрабатываем выбранные анекдоты
    const jokeIds = selectionMode ? Array.from(selectedJokes) : [];

    if (selectionMode) {
      if (jokeIds.length === 0) {
        setError("Выберите хотя бы один анекдот");
        return;
      }
      if (jokeIds.length > 10) {
        setError("Можно выбрать максимум 10 анекдотов");
        return;
      }
    } else {
      if (batchCount < 1 || batchCount > 10) {
        setError("Количество должно быть от 1 до 10");
        return;
      }
    }

    setBatchProcessing(true);
    setError(null);
    setBatchProgress({
      current: 0,
      total: selectionMode ? jokeIds.length : batchCount,
      results: [],
      errors: [],
    });

    try {
      const response = await fetch("/api/videos/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(selectionMode
            ? { jokeIds }
            : {
                count: batchCount,
                language: "es",
              }),
          privacyStatus: "public",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось запустить массовую обработку");
      }

      const result = await response.json();

      setBatchProgress({
        current: result.processed,
        total: result.total,
        results: result.results || [],
        errors: result.errors || [],
      });

      // Очищаем выбранные после успешной обработки
      if (selectionMode) {
        setSelectedJokes(new Set());
      }

      // Обновляем список после обработки
      await loadJokes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to process batch:", err);
    } finally {
      setBatchProcessing(false);
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

      {/* Массовая обработка */}
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-purple-900">
            Массовая обработка и публикация
          </h3>
          <button
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelectedJokes(new Set());
            }}
            disabled={batchProcessing}
            className={`px-4 py-2 rounded-md transition-colors font-medium text-sm ${
              selectionMode
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-white text-purple-600 border border-purple-300 hover:bg-purple-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {selectionMode ? '✓ Режим выбора' : 'Выбрать анекдоты'}
          </button>
        </div>

        {selectionMode ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-purple-700">
                Выбрано: {selectedJokes.size} из {jokes.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  disabled={batchProcessing}
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                >
                  Выбрать все
                </button>
                <span className="text-purple-300">|</span>
                <button
                  onClick={deselectAll}
                  disabled={batchProcessing}
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                >
                  Снять выбор
                </button>
              </div>
            </div>
            <button
              onClick={processBatch}
              disabled={batchProcessing || selectedJokes.size === 0}
              className="w-full px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium disabled:bg-purple-400 disabled:cursor-not-allowed"
            >
              {batchProcessing
                ? "Обработка..."
                : `Обработать выбранные (${selectedJokes.size})`}
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label htmlFor="batchCount" className="block text-sm font-medium text-purple-700 mb-2">
                Количество анекдотов (1-10)
              </label>
              <input
                id="batchCount"
                type="number"
                min="1"
                max="10"
                value={batchCount}
                onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                disabled={batchProcessing}
                className="w-full px-4 py-2 border border-purple-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={processBatch}
              disabled={batchProcessing}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium disabled:bg-purple-400 disabled:cursor-not-allowed"
            >
              {batchProcessing ? "Обработка..." : "Запустить обработку"}
            </button>
          </div>
        )}

        {batchProcessing && (
          <div className="mt-4 p-4 bg-white rounded-md border border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-900">
                Обработка в процессе...
              </span>
              <span className="text-sm text-purple-600">
                Это может занять несколько минут
              </span>
            </div>
            <div className="w-full bg-purple-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: "50%" }}
              />
            </div>
          </div>
        )}

        {batchProgress && !batchProcessing && (
          <div className="mt-4 space-y-3">
            <div className="p-4 bg-white rounded-md border border-purple-200">
              <div className="text-sm font-medium text-purple-900 mb-2">
                Завершено: {batchProgress.current} из {batchProgress.total}
              </div>

              {batchProgress.results.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-green-700 mb-2">
                    ✓ Успешно опубликовано ({batchProgress.results.length}):
                  </div>
                  <div className="space-y-1">
                    {batchProgress.results.map((result: any) => (
                      <div key={result.index} className="text-xs text-gray-600">
                        #{result.index}: {result.title} -
                        <a
                          href={result.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline ml-1"
                        >
                          Смотреть на YouTube
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {batchProgress.errors.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-red-700 mb-2">
                    ✗ Ошибки ({batchProgress.errors.length}):
                  </div>
                  <div className="space-y-1">
                    {batchProgress.errors.map((err: any, idx: number) => (
                      <div key={idx} className="text-xs text-red-600">
                        #{err.index}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
            selectable={selectionMode}
            selected={selectedJokes.has(String(joke._id))}
            onToggleSelect={toggleJokeSelection}
          />
        ))}
      </div>
    </div>
  );
}

