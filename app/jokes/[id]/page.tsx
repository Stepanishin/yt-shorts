"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface JokeData {
  _id?: string;
  source: string;
  title?: string;
  text: string;
  editedText?: string;
  category?: string;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
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
  audioUrl?: string; // URL сгенерированного аудио
  editedText?: string;
  finalVideoUrl?: string;
  renderingStatus?: "pending" | "running" | "completed" | "failed";
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
  const [randomEmoji, setRandomEmoji] = useState("");
  const [rendering, setRendering] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [uploadingToYouTube, setUploadingToYouTube] = useState(false);
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState<string | null>(null);
  const [useAITitle, setUseAITitle] = useState(true); // По умолчанию включено
  const [deleting, setDeleting] = useState(false);

  // Выбираем случайную эмодзи при монтировании и при изменении текста
  useEffect(() => {
    // Смеющиеся эмодзи
    const laughingEmojis = ["😂", "🤣", "😆", "😄", "😃", "😊", "😁", "😀", "🤪", "😜", "🥳", "😋"];
    const randomIndex = Math.floor(Math.random() * laughingEmojis.length);
    setRandomEmoji(laughingEmojis[randomIndex]);
  }, [editedText, videoJob?.editedText]);

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

  // Инициализируем editedText из joke.editedText или joke.text
  useEffect(() => {
    if (joke && !editedText) {
      setEditedText(joke.editedText || joke.text);
    }
  }, [joke]);

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
    if (!joke?._id) return;

    setSaving(true);
    setError(null);
    try {
      // Сохраняем editedText в анекдот (joke_candidates)
      const response = await fetch(`/api/jokes/${joke._id}`, {
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

      // Обновляем joke с новым editedText
      setJoke(result.joke);

      // Также обновляем videoJob если он существует
      if (videoJob?._id) {
        const videoResponse = await fetch(`/api/videos/${videoJob._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            editedText: editedText,
          }),
        });

        if (videoResponse.ok) {
          const videoResult = await videoResponse.json();
          setVideoJob(videoResult.job);
        }
      }

      setIsEditing(false);
      console.log("Text saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to save text:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRenderVideo = async () => {
    if (!videoJob?._id) return;

    setRendering(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${videoJob._id}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emoji: randomEmoji,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось начать рендеринг видео");
      }

      // Начинаем polling статуса рендеринга
      startRenderingPolling(videoJob._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to render video:", err);
      setRendering(false);
    }
  };

  const handleResetRenderingStatus = async () => {
    if (!videoJob?._id) return;

    setError(null);
    try {
      const response = await fetch(`/api/videos/${videoJob._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          renderingStatus: "pending", // Сбрасываем статус
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось сбросить статус рендеринга");
      }

      const result = await response.json();
      setVideoJob(result.job);
      setRendering(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to reset rendering status:", err);
    }
  };

  const startRenderingPolling = (jobId: string) => {
    let intervalId: NodeJS.Timeout | null = null;
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/videos/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setVideoJob(data.job);

          // Останавливаем polling если рендеринг завершен
          if (data.job.renderingStatus === "completed" || data.job.renderingStatus === "failed") {
            if (intervalId) {
              clearInterval(intervalId);
            }
            setRendering(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to poll rendering status:", err);
      }
    };

    // Первый запрос сразу
    poll();

    // Затем polling каждые 2 секунды
    intervalId = setInterval(poll, 2000);

    // Останавливаем polling через 10 минут
    setTimeout(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      setRendering(false);
    }, 10 * 60 * 1000);
  };

  const handleGenerateAudio = async () => {
    if (!videoJob?._id) return;

    setGeneratingAudio(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${videoJob._id}/audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskType: "txt2audio-base", // Можно сделать выбор качества
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось начать генерацию аудио");
      }

      // Начинаем polling статуса для проверки появления audioUrl
      startAudioPolling(videoJob._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to generate audio:", err);
      setGeneratingAudio(false);
    }
  };

  const startAudioPolling = (jobId: string) => {
    let intervalId: NodeJS.Timeout | null = null;
    let attempts = 0;
    const maxAttempts = 150; // 5 минут (150 * 2 секунды)

    const poll = async () => {
      try {
        attempts++;
        const response = await fetch(`/api/videos/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setVideoJob(data.job);

          // Останавливаем polling если аудио сгенерировано
          if (data.job.audioUrl) {
            if (intervalId) {
              clearInterval(intervalId);
            }
            setGeneratingAudio(false);
            return;
          }

          // Останавливаем если превышен лимит попыток
          if (attempts >= maxAttempts) {
            if (intervalId) {
              clearInterval(intervalId);
            }
            setGeneratingAudio(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to poll audio status:", err);
      }
    };

    // Первый запрос сразу
    poll();

    // Затем polling каждые 2 секунды
    intervalId = setInterval(poll, 2000);

    // Останавливаем polling через 5 минут
    setTimeout(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      setGeneratingAudio(false);
    }, 5 * 60 * 1000);
  };

  const handleAuthorizeYouTube = () => {
    // Открываем страницу авторизации YouTube в новом окне
    window.open("/api/youtube/auth", "_blank");
  };

  const handleUploadToYouTube = async () => {
    if (!videoJob?.finalVideoUrl || !joke) return;

    setUploadingToYouTube(true);
    setError(null);
    try {
      const jokeText = editedText || joke.text;
      let title: string;
      let description: string;

      // Используем AI для генерации названия и описания, если включено
      if (useAITitle) {
        try {
          const aiResponse = await fetch("/api/youtube/generate-title", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jokeText,
              jokeTitle: joke.title,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            title = aiData.title;
            description = aiData.description;
          } else {
            throw new Error("AI generation failed");
          }
        } catch (aiError) {
          console.warn("AI title generation failed, using fallback:", aiError);
          // Fallback к простому названию
          const baseTitle = joke.title || "Chiste del día";
          title = `#Shorts ${baseTitle} 😂🤣`;
          description = `${jokeText}

🎭 Chistes en Español | Humor Latino
😂 Síguenos para más risas diarias

#Shorts #Chistes #Humor #Comedia #Risas`;
        }
      } else {
        // Используем простое название без AI
        const baseTitle = joke.title || "Chiste del día";
        title = `#Shorts ${baseTitle} 😂🤣`;
        description = `${jokeText}

🎭 Chistes en Español | Humor Latino
😂 Síguenos para más risas diarias

#Shorts #Chistes #Humor #Comedia #Risas
#ChistesCortos #HumorLatino #ChistesEspañol
#Funny #Comedy #Viral #Trending

© Generated with AI`;
      }

      // Оптимизированные теги для испанского контента
      const tags = [
        "shorts",
        "chistes",
        "humor",
        "comedia",
        "risas",
        "chistes cortos",
        "humor latino",
        "chistes español",
        "funny",
        "comedy",
        "jokes",
        "spanish jokes",
        "humor en español"
      ];

      const response = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl: videoJob.finalVideoUrl,
          title,
          description,
          tags,
          privacyStatus: "public",
          jokeId: joke._id, // Передаем ID анекдота для обновления статуса
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Если ошибка авторизации, предлагаем авторизоваться
        if (response.status === 401) {
          const shouldAuth = confirm(
            "Необходима авторизация YouTube. Открыть страницу авторизации?"
          );
          if (shouldAuth) {
            handleAuthorizeYouTube();
          }
          throw new Error("Необходима авторизация YouTube");
        }

        throw new Error(errorData.error || "Не удалось загрузить видео на YouTube");
      }

      const result = await response.json();
      setYoutubeVideoUrl(result.videoUrl);

      // Обновляем статус анекдота на клиенте
      if (joke) {
        setJoke({
          ...joke,
          status: "used",
        });
      }

      // Показываем успешное сообщение
      alert(`Видео успешно загружено на YouTube!\n${result.videoUrl}\n\nАнекдот помечен как "Использован" и больше не будет отображаться в списке.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to upload to YouTube:", err);
    } finally {
      setUploadingToYouTube(false);
    }
  };

  const handleDelete = async () => {
    if (!joke?._id) return;

    const confirmed = confirm("Вы уверены, что хотите удалить этот анекдот? Он будет помечен как удаленный и не будет отображаться в списке.");
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/jokes/${joke._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось удалить анекдот");
      }

      console.log("Joke deleted successfully");
      alert("Анекдот успешно удален и больше не будет отображаться в списке.");

      // Перенаправляем на главную страницу
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to delete joke:", err);
      alert(`Ошибка удаления: ${err instanceof Error ? err.message : "Произошла ошибка"}`);
    } finally {
      setDeleting(false);
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
    deleted: "Удален",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-800",
    reserved: "bg-blue-100 text-blue-800",
    used: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    deleted: "bg-gray-200 text-gray-600",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            ← Вернуться к списку
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting || joke.status === "deleted"}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
          >
            {deleting ? "Удаление..." : joke.status === "deleted" ? "Удалено" : "🗑️ Удалить анекдот"}
          </button>
        </div>

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
              <button
                onClick={() => setIsEditing(!isEditing)}
                disabled={joke.status === "deleted"}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isEditing ? "Отмена редактирования" : "Редактировать текст"}
              </button>
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
                      // Возвращаем текст к исходному значению
                      setEditedText(joke?.editedText || joke?.text || "");
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
                {joke.editedText || joke.text}
              </div>
            )}
          </div>

          {/* Секция генерации видео */}
          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Генерация видео
            </h2>

            {/* Кнопки генерации */}
            <div className="flex gap-3 mb-6 flex-wrap">
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
                <>
                  <button
                    onClick={regenerateBackground}
                    disabled={generating}
                    className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {generating ? "Перегенерация фона..." : "Перегенерировать фон"}
                  </button>
                  {videoJob.status === "completed" && (
                    <button
                      onClick={handleGenerateAudio}
                      disabled={generatingAudio || !videoJob.backgroundVideoUrl}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                    >
                      {generatingAudio
                        ? "Генерация аудио..."
                        : videoJob.audioUrl
                          ? "Перегенерировать аудио"
                          : "Сгенерировать аудио"}
                    </button>
                  )}
                  {videoJob.status === "completed" && videoJob.backgroundVideoUrl && (
                    <>
                      {videoJob.renderingStatus === "running" && (
                        <button
                          onClick={handleResetRenderingStatus}
                          className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors font-medium"
                          title="Сбросить статус рендеринга если процесс завис"
                        >
                          Сбросить статус рендеринга
                        </button>
                      )}
                      <button
                        onClick={handleRenderVideo}
                        disabled={rendering || videoJob.renderingStatus === "running"}
                        className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                      >
                        {rendering || videoJob.renderingStatus === "running"
                          ? "Рендеринг видео..."
                          : videoJob.finalVideoUrl
                            ? "Перерендерить видео"
                            : "Собрать финальное видео"}
                      </button>
                    </>
                  )}
                  {/* Кнопка публикации на YouTube */}
                  {videoJob.finalVideoUrl && videoJob.renderingStatus === "completed" && (
                    <div className="flex flex-col gap-3 w-full">
                      {/* Опция AI-генерации названия */}
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useAITitle}
                          onChange={(e) => setUseAITitle(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span>🤖 Использовать AI для генерации привлекательного названия и описания</span>
                      </label>

                      <button
                        onClick={handleUploadToYouTube}
                        disabled={uploadingToYouTube}
                        className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center gap-2 justify-center"
                      >
                        {uploadingToYouTube ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            Загрузка на YouTube...
                          </>
                        ) : youtubeVideoUrl ? (
                          "✅ Загружено на YouTube"
                        ) : (
                          <>
                            📤 Опубликовать на YouTube
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Показываем ссылку на YouTube видео если оно загружено */}
            {youtubeVideoUrl && (
              <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="font-medium mb-2 text-green-800">
                  ✅ Видео успешно опубликовано на YouTube!
                </div>
                <a
                  href={youtubeVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 underline inline-block"
                >
                  Открыть видео на YouTube →
                </a>
              </div>
            )}

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

            {/* Статус генерации аудио */}
            {videoJob && (
              <div
                className={`mb-6 rounded-lg border p-4 ${
                  videoJob.audioUrl
                    ? "border-green-200 bg-green-50"
                    : generatingAudio
                      ? "border-indigo-200 bg-indigo-50"
                      : videoJob.status === "completed"
                        ? "border-gray-200 bg-gray-50"
                        : "border-yellow-200 bg-yellow-50"
                }`}
              >
                <div
                  className={`font-medium mb-2 ${
                    videoJob.audioUrl
                      ? "text-green-800"
                      : generatingAudio
                        ? "text-indigo-800"
                        : "text-gray-800"
                  }`}
                >
                  {videoJob.audioUrl
                    ? "✅ Аудио готово!"
                    : generatingAudio
                      ? "🎵 Генерация аудио через DiffRhythm..."
                      : "🎵 Аудио не сгенерировано"}
                </div>
                {videoJob.audioUrl && (
                  <div className="mt-3 space-y-2">
                    <div className="text-sm text-green-600">
                      Аудио успешно сгенерировано через DiffRhythm AI
                    </div>
                    <a
                      href={videoJob.audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 underline inline-block"
                    >
                      Прослушать аудио
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Статус рендеринга финального видео */}
            {videoJob?.renderingStatus && (
              <div
                className={`mb-6 rounded-lg border p-4 ${
                  videoJob.renderingStatus === "completed"
                    ? "border-green-200 bg-green-50"
                    : videoJob.renderingStatus === "failed"
                      ? "border-red-200 bg-red-50"
                      : videoJob.renderingStatus === "running"
                        ? "border-purple-200 bg-purple-50"
                        : "border-yellow-200 bg-yellow-50"
                }`}
              >
                <div
                  className={`font-medium mb-2 ${
                    videoJob.renderingStatus === "completed"
                      ? "text-green-800"
                      : videoJob.renderingStatus === "failed"
                        ? "text-red-800"
                        : videoJob.renderingStatus === "running"
                          ? "text-purple-800"
                          : "text-yellow-800"
                  }`}
                >
                  {videoJob.renderingStatus === "completed"
                    ? "Финальное видео готово!"
                    : videoJob.renderingStatus === "failed"
                      ? "Ошибка рендеринга"
                      : videoJob.renderingStatus === "running"
                        ? "Рендеринг финального видео..."
                        : "Ожидание начала рендеринга"}
                </div>
                {videoJob.finalVideoUrl && (
                  <div className="mt-3">
                    <a
                      href={videoJob.finalVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 underline"
                    >
                      Скачать финальное видео
                    </a>
                  </div>
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
                  <div className="bg-white/60 backdrop-blur-sm rounded-lg px-6 py-8 max-w-[90%] w-full text-center relative">
                    {joke.title && (
                      <h4 className="text-xl font-bold mb-3 text-gray-900">
                        {joke.title}
                      </h4>
                    )}
                    <p className="text-base font-bold leading-relaxed text-gray-900 whitespace-pre-wrap break-words">
                      {editedText || joke.text}
                    </p>
                    {/* Рандомная смеющаяся эмодзи справа внизу */}
                    {randomEmoji && (
                      <div className="absolute bottom-2 right-2 text-4xl animate-bounce">
                        <span className="inline-block">{randomEmoji}</span>
                      </div>
                    )}
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

