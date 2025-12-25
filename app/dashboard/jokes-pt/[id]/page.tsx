"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface JokeDataPT {
  _id?: string;
  source: string;
  title?: string;
  text: string;
  editedText?: string;
  category?: string;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  createdAt?: string;
}

export default function JokePTDetailPage() {
  const params = useParams();
  const [joke, setJoke] = useState<JokeDataPT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const id = params?.id as string;

  useEffect(() => {
    if (!id) return;

    const loadJoke = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/jokes-pt/${id}`);
        if (!response.ok) {
          throw new Error("[PT] Não foi possível carregar a piada");
        }
        const data = await response.json();
        setJoke(data.joke);
        setEditedText(data.joke.editedText || data.joke.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Произошла ошибка");
        console.error("[PT] Failed to load joke:", err);
      } finally {
        setLoading(false);
      }
    };

    loadJoke();
  }, [id]);

  const handleSaveText = async () => {
    if (!joke?._id) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jokes-pt/${joke._id}`, {
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
        throw new Error(errorData.error || "[PT] Não foi possível salvar o texto");
      }

      const result = await response.json();
      setJoke(result.joke);
      setIsEditing(false);
      console.log("[PT] Text saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[PT] Failed to save text:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!joke?._id) return;

    if (!confirm("Вы уверены, что хотите удалить эту португальскую пиаду?")) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/jokes-pt/${joke._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "[PT] Não foi possível excluir a piada");
      }

      console.log("[PT] Joke deleted successfully");
      window.location.href = "/dashboard/jokes-pt";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("[PT] Failed to delete joke:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Carregando piada portuguesa...</div>
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
              href="/dashboard/jokes-pt"
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
    piadacom: "PIADA.COM",
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
            href="/dashboard/jokes-pt"
            className="inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            ← Вернуться к списку португальских пиад
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting || joke.status === "deleted"}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
          >
            {deleting ? "Удаление..." : joke.status === "deleted" ? "Удалено" : "🗑️ Удалить пиаду"}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
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

          {joke.title && (
            <h1 className="text-3xl font-bold text-gray-900 mb-6">{joke.title}</h1>
          )}

          <div className="mb-8">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900">Текст пиады</h3>
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
                    Текст пиады
                  </label>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-900 text-lg leading-relaxed min-h-[200px] resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Введите текст пиады..."
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

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-red-800 font-medium mb-2">Ошибка</div>
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
