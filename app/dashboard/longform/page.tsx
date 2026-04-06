"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface GenerationResult {
  jobId: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  duration: number;
  scenesCount: number;
  scheduledAt: string;
}

export default function LongformPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [celebrityName, setCelebrityName] = useState("");
  const [context, setContext] = useState("");
  const [ttsVoice, setTtsVoice] = useState<"onyx" | "nova" | "alloy">("onyx");
  const [privacyStatus, setPrivacyStatus] = useState<"public" | "private" | "unlisted">("public");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setScheduledDate(tomorrow.toISOString().split("T")[0]);

    fetch("/api/youtube/my-channels")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setChannels(data);
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!celebrityName.trim()) {
      setError("Введите имя знаменитости");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setLogs(["Запуск генерации..."]);

    try {
      let scheduledAt: string | undefined;
      if (publishMode === "schedule" && scheduledDate) {
        scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      }

      setLogs((prev) => [...prev, `Генерация видео: ${celebrityName}...`]);
      setLogs((prev) => [...prev, "Это может занять 5-10 минут..."]);

      const response = await fetch("/api/longform/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          celebrityName: celebrityName.trim(),
          context: context.trim() || undefined,
          publishNow: publishMode === "now",
          scheduledAt,
          youtubeChannelId: selectedChannel || undefined,
          privacyStatus,
          ttsVoice,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка генерации");
      }

      setResult(data);
      setLogs((prev) => [
        ...prev,
        `Видео создано: ${data.title}`,
        `Длительность: ${Math.round(data.duration)}с (${Math.round(data.duration / 60)} мин)`,
        `Сцены: ${data.scenesCount}`,
        publishMode === "now"
          ? "Публикация запланирована через 2 минуты"
          : `Запланировано на: ${new Date(data.scheduledAt).toLocaleString("ru-RU")}`,
      ]);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setLogs((prev) => [...prev, `Ошибка: ${msg}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Генератор длинных видео
        </h1>
        <p className="text-gray-600 mb-6">
          Генерация биографических видео 5-8 минут об испанских знаменитостях с
          AI-озвучкой, фото и субтитрами.
        </p>

        {/* Форма */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Настройки
          </h2>

          {/* Имя знаменитости */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Имя знаменитости *
            </label>
            <input
              type="text"
              value={celebrityName}
              onChange={(e) => setCelebrityName(e.target.value)}
              placeholder="Например: Isabel Pantoja, David Bustamante, Reina Sofia..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              disabled={isGenerating}
            />
          </div>

          {/* Контекст */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Контекст / фокус (необязательно)
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Например: Скандал с Kiko Rivera, Дело Cantora..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              disabled={isGenerating}
            />
          </div>

          {/* Голос и приватность */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Голос озвучки
              </label>
              <select
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                disabled={isGenerating}
              >
                <option value="onyx">Onyx (мужской, драматичный)</option>
                <option value="nova">Nova (женский, теплый)</option>
                <option value="alloy">Alloy (нейтральный)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Приватность
              </label>
              <select
                value={privacyStatus}
                onChange={(e) => setPrivacyStatus(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                disabled={isGenerating}
              >
                <option value="public">Публичное</option>
                <option value="private">Приватное</option>
                <option value="unlisted">По ссылке</option>
              </select>
            </div>
          </div>

          {/* Канал YouTube */}
          {channels.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Канал YouTube
              </label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                disabled={isGenerating}
              >
                <option value="">Канал по умолчанию</option>
                {channels.map((ch: any) => (
                  <option key={ch.channelId} value={ch.channelId}>
                    {ch.channelTitle} ({ch.channelId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Режим публикации */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Публикация
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={publishMode === "now"}
                  onChange={() => setPublishMode("now")}
                  disabled={isGenerating}
                />
                <span className="text-gray-900">Опубликовать сейчас</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={publishMode === "schedule"}
                  onChange={() => setPublishMode("schedule")}
                  disabled={isGenerating}
                />
                <span className="text-gray-900">Запланировать</span>
              </label>
            </div>
          </div>

          {/* Дата и время */}
          {publishMode === "schedule" && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дата
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  disabled={isGenerating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Время
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  disabled={isGenerating}
                />
              </div>
            </div>
          )}

          {/* Кнопка генерации */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !celebrityName.trim()}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
              isGenerating || !celebrityName.trim()
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Генерация видео (5-10 мин)...
              </span>
            ) : (
              "Сгенерировать видео"
            )}
          </button>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 font-medium">Ошибка: {error}</p>
          </div>
        )}

        {/* Результат */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-green-800 mb-3">
              Видео создано
            </h3>
            <div className="space-y-2 text-green-700">
              <p>
                <strong>Название:</strong> {result.title}
              </p>
              <p>
                <strong>Длительность:</strong>{" "}
                {Math.floor(result.duration / 60)}:
                {Math.floor(result.duration % 60)
                  .toString()
                  .padStart(2, "0")}{" "}
                мин
              </p>
              <p>
                <strong>Сцен:</strong> {result.scenesCount}
              </p>
              <p>
                <strong>Запланировано:</strong>{" "}
                {new Date(result.scheduledAt).toLocaleString("ru-RU")}
              </p>
              {result.videoUrl && (
                <p>
                  <strong>Видео:</strong>{" "}
                  <a
                    href={result.videoUrl}
                    target="_blank"
                    className="underline"
                  >
                    Открыть видео
                  </a>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Логи */}
        {logs.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Лог</h3>
            <div className="font-mono text-sm text-green-400 space-y-1">
              {logs.map((log, i) => (
                <div key={i}>
                  <span className="text-gray-500">
                    {new Date().toLocaleTimeString("ru-RU")}
                  </span>{" "}
                  {log}
                </div>
              ))}
              {isGenerating && (
                <div className="animate-pulse text-yellow-400">
                  Обработка...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
