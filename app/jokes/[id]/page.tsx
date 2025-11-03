"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface JokeData {
  _id?: string;
  source: string;
  title?: string;
  text: string;
  category?: string;
  status?: "pending" | "reserved" | "used" | "rejected";
  ratingPercent?: number;
  votesTotal?: number;
  createdAt?: string;
}

interface VideoJob {
  _id?: string;
  status: "pending" | "running" | "completed" | "failed";
  jokeId?: string;
  error?: string;
  backgroundVideoUrl?: string;
  backgroundPrompt?: string;
  editedText?: string;
}

export default function JokeDetailPage() {
  const params = useParams();
  const [joke, setJoke] = useState<JokeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);

  const id = params?.id as string;

  const startPolling = (jobId: string) => {
    let intervalId: NodeJS.Timeout | null = null;
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/videos/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setVideoJob(data.job);
          // Обновляем editedText если он изменился
          if (data.job.editedText !== undefined) {
            setEditedText(data.job.editedText || joke?.text || "");
          }

          // Останавливаем polling если статус завершенный
          if (data.job.status === "completed" || data.job.status === "failed") {
            if (intervalId) {
              clearInterval(intervalId);
            }
            setGenerating(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to poll video status:", err);
      }
    };

    // Первый запрос сразу
    poll();

    // Затем polling каждые 2 секунды
    intervalId = setInterval(poll, 2000);

    // Останавливаем polling через 10 минут (на случай если что-то пошло не так)
    setTimeout(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      setGenerating(false);
    }, 10 * 60 * 1000);
  };

  useEffect(() => {
    if (!id) return;

    const loadJoke = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/jokes/${id}`);
        if (!response.ok) {
          throw new Error("Не удалось загрузить анекдот");
        }
        const data = await response.json();
        setJoke(data.joke);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Произошла ошибка");
        console.error("Failed to load joke:", err);
      } finally {
        setLoading(false);
      }
    };

    const loadVideoJob = async () => {
      try {
        const response = await fetch(`/api/videos/joke/${id}`);
        if (response.ok) {
            const data = await response.json();
          if (data.job) {
            setVideoJob(data.job);
            // Устанавливаем editedText если есть, иначе используем оригинальный текст
            setEditedText(data.job.editedText || joke?.text || "");
            // Если видео еще генерируется, запускаем polling
            if (data.job.status === "running" || data.job.status === "pending") {
              startPolling(data.job._id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load video job:", err);
      }
    };

    loadJoke();
    loadVideoJob();
  }, [id]);

  const generateVideo = async () => {
    if (!joke?._id) return;

    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jokeId: joke._id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось начать генерацию видео");
      }

      const result = await response.json();
      setVideoJob(result.job);
      setEditedText(result.job.editedText || joke?.text || "");

      // Начинаем polling статуса
      startPolling(result.job._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to generate video:", err);
      setGenerating(false);
    }
  };

  const regenerateBackground = async () => {
    if (!joke?._id || !videoJob?._id) return;

    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jokeId: joke._id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось начать перегенерацию видео");
      }

      const result = await response.json();
      setVideoJob(result.job);
      setEditedText(result.job.editedText || joke?.text || "");

      // Начинаем polling статуса
      startPolling(result.job._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to regenerate background:", err);
      setGenerating(false);
    }
  };

  const handleSaveText = async () => {
    if (!videoJob?._id) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${videoJob._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          editedText: editedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось сохранить текст");
      }

      const result = await response.json();
      setVideoJob(result.job);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to save text:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Загрузка анекдота...</div>
      </div>
    );
  }

  if (error && !joke) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="text-red-800 font-medium mb-2">Ошибка</div>
            <div className="text-red-600 text-sm mb-3">{error}</div>
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Вернуться к списку
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!joke) {
    return null;
  }

  const sourceLabels: Record<string, string> = {
    chistes: "Chistes.com",
    yavendras: "Yavendras.com",
    todochistes: "TodoChistes.net",
  };

  const statusLabels: Record<string, string> = {
    pending: "Ожидает",
    reserved: "Зарезервирован",
    used: "Использован",
    rejected: "Отклонен",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-800",
    reserved: "bg-blue-100 text-blue-800",
    used: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-6"
        >
          ← Вернуться к списку
        </Link>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {/* Заголовок и метаданные */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">
                {sourceLabels[joke.source] ?? joke.source}
              </span>
              {joke.category && (
                <span className="text-xs text-gray-500">• {joke.category}</span>
              )}
            </div>
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                statusColors[joke.status ?? "pending"] ?? statusColors.pending
              }`}
            >
              {statusLabels[joke.status ?? "pending"] ?? joke.status}
            </span>
          </div>

          {/* Заголовок анекдота */}
          {joke.title && (
            <h1 className="text-3xl font-bold text-gray-900 mb-6">{joke.title}</h1>
          )}

          {/* Текст анекдота */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900">Текст анекдота</h3>
              {videoJob && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  {isEditing ? "Отмена редактирования" : "Редактировать текст"}
                </button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Текст анекдота
                  </label>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-900 text-lg leading-relaxed min-h-[200px] resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Введите текст анекдота..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveText}
                    disabled={saving}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {saving ? "Сохранение..." : "Сохранить изменения"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedText(videoJob?.editedText || joke?.text || "");
                    }}
                    disabled={saving}
                    className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-lg text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-md border border-gray-200">
                {editedText || joke.text}
              </div>
            )}
          </div>

          {/* Секция генерации видео */}
          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Генерация видео
            </h2>

            {/* Кнопки генерации */}
            <div className="flex gap-3 mb-6">
              {!videoJob || videoJob.status === "failed" ? (
                <button
                  onClick={generateVideo}
                  disabled={generating || joke.status === "used"}
                  className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {generating
                    ? "Генерация видео..."
                    : joke.status === "used"
                      ? "Анекдот уже использован"
                      : "Сгенерировать видео"}
                </button>
              ) : (
                <button
                  onClick={regenerateBackground}
                  disabled={generating}
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {generating ? "Перегенерация фона..." : "Перегенерировать фон"}
                </button>
              )}
            </div>

            {/* Статус генерации */}
            {videoJob && (
              <div
                className={`mb-6 rounded-lg border p-4 ${
                  videoJob.status === "completed"
                    ? "border-green-200 bg-green-50"
                    : videoJob.status === "failed"
                      ? "border-red-200 bg-red-50"
                      : videoJob.status === "running"
                        ? "border-blue-200 bg-blue-50"
                        : "border-yellow-200 bg-yellow-50"
                }`}
              >
                <div
                  className={`font-medium mb-2 ${
                    videoJob.status === "completed"
                      ? "text-green-800"
                      : videoJob.status === "failed"
                        ? "text-red-800"
                        : videoJob.status === "running"
                          ? "text-blue-800"
                          : "text-yellow-800"
                  }`}
                >
                  {videoJob.status === "completed"
                    ? "Видео готово!"
                    : videoJob.status === "failed"
                      ? "Ошибка генерации"
                      : videoJob.status === "running"
                        ? "Видео генерируется..."
                        : "Ожидание начала генерации"}
                </div>
                <div
                  className={`text-sm ${
                    videoJob.status === "completed"
                      ? "text-green-600"
                      : videoJob.status === "failed"
                        ? "text-red-600"
                        : videoJob.status === "running"
                          ? "text-blue-600"
                          : "text-yellow-600"
                  }`}
                >
                  Статус: {videoJob.status}
                </div>
                {videoJob.error && (
                  <div className="mt-2 text-sm text-red-600">{videoJob.error}</div>
                )}
              </div>
            )}

            {/* Превью видео / Бэкграунд */}
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Превью видео
              </h3>
              <div className="aspect-[9/16] max-w-sm mx-auto rounded-lg overflow-hidden relative shadow-lg bg-gray-100">
                {/* Фон: сгенерированное видео или градиент-заглушка */}
                {videoJob?.backgroundVideoUrl ? (
                  <video
                    src={videoJob.backgroundVideoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500" />
                )}

                {/* Текст анекдота на фоне */}
                <div className="absolute inset-0 flex items-center justify-center p-6 overflow-y-auto">
                  <div className="bg-white/60 backdrop-blur-sm rounded-lg px-6 py-8 max-w-[90%] w-full text-center">
                    {joke.title && (
                      <h4 className="text-xl font-bold mb-3 text-gray-900">
                        {joke.title}
                      </h4>
                    )}
                    <p className="text-base font-bold leading-relaxed text-gray-900 whitespace-pre-wrap break-words">
                      {editedText || joke.text}
                    </p>
                  </div>
                </div>

                {/* Индикатор загрузки видео фона */}
                {videoJob?.status === "running" && !videoJob.backgroundVideoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="text-white text-center">
                      <div className="text-sm mb-2">Генерация видео фона...</div>
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mx-auto" />
                    </div>
                  </div>
                )}
              </div>

              {videoJob?.backgroundVideoUrl && (
                <div className="mt-3 text-xs text-gray-500 text-center">
                  Видео фон сгенерирован через Luma Dream Machine
                </div>
              )}
              
              {!videoJob?.backgroundVideoUrl && (
                <div className="mt-3 text-xs text-gray-500 text-center">
                  Превью того, как будет выглядеть видео с анекдотом
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 text-sm text-red-600">{error}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

