"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface ScheduledVideo {
  id: string;
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
  scheduledAt: string;
  status: "planned" | "publishing" | "published" | "failed";
  createdAt: string;
  publishedAt?: string;
  youtubeVideoId?: string;
  youtubeVideoUrl?: string;
  errorMessage?: string;
}

export default function ScheduledVideosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [scheduledVideos, setScheduledVideos] = useState<ScheduledVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated") {
      fetchScheduledVideos();
    }
  }, [status, router]);

  const fetchScheduledVideos = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/youtube/schedule");

      if (!response.ok) {
        throw new Error("Failed to fetch scheduled videos");
      }

      const data = await response.json();
      setScheduledVideos(data.scheduledVideos || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching scheduled videos:", err);
      setError("Не удалось загрузить запланированные видео");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (videoId: string) => {
    if (!confirm("Вы уверены, что хотите отменить публикацию этого видео?")) {
      return;
    }

    try {
      const response = await fetch(`/api/youtube/schedule/${videoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete scheduled video");
      }

      // Обновляем список
      setScheduledVideos(prev => prev.filter(v => v.id !== videoId));
    } catch (err) {
      console.error("Error deleting scheduled video:", err);
      alert("Не удалось удалить запланированное видео");
    }
  };

  const getStatusBadge = (status: ScheduledVideo["status"]) => {
    switch (status) {
      case "planned":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">Запланировано</span>;
      case "publishing":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Публикуется</span>;
      case "published":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">Опубликовано</span>;
      case "failed":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">Ошибка</span>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Запланированные видео</h1>
        <button
          onClick={fetchScheduledVideos}
          className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center gap-2"
        >
          🔄 Обновить
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {scheduledVideos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600 text-lg mb-4">У вас нет запланированных видео</p>
          <p className="text-gray-500 text-sm">
            Создайте видео в конструкторе и нажмите кнопку "Запланировать" для автоматической публикации
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {scheduledVideos.map((video) => (
            <div
              key={video.id}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-semibold text-gray-900">{video.title}</h2>
                    {getStatusBadge(video.status)}
                  </div>
                  {video.description && (
                    <p className="text-gray-600 text-sm mb-2">{video.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {video.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-600">Запланировано на:</span>
                  <p className="font-semibold text-gray-900">{formatDate(video.scheduledAt)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Создано:</span>
                  <p className="font-semibold text-gray-900">{formatDate(video.createdAt)}</p>
                </div>
                {video.publishedAt && (
                  <div>
                    <span className="text-gray-600">Опубликовано:</span>
                    <p className="font-semibold text-gray-900">{formatDate(video.publishedAt)}</p>
                  </div>
                )}
                {video.privacyStatus && (
                  <div>
                    <span className="text-gray-600">Приватность:</span>
                    <p className="font-semibold text-gray-900">{video.privacyStatus}</p>
                  </div>
                )}
              </div>

              {video.errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                  <p className="text-red-800 text-sm">
                    <strong>Ошибка:</strong> {video.errorMessage}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {video.status === "published" && video.youtubeVideoUrl && (
                  <a
                    href={video.youtubeVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 flex items-center gap-2"
                  >
                    📺 Открыть на YouTube
                  </a>
                )}
                {video.status === "planned" && (
                  <button
                    onClick={() => handleDelete(video.id)}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                  >
                    🗑️ Отменить
                  </button>
                )}
                {video.videoUrl && (
                  <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                  >
                    👁️ Просмотр видео
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
