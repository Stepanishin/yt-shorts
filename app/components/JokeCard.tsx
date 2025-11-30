"use client";

import { useState } from "react";
import Link from "next/link";

interface JokeCardProps {
  joke: {
    _id?: string;
    source: string;
    title?: string;
    text: string;
    category?: string;
    status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
    ratingPercent?: number;
    votesTotal?: number;
    createdAt?: string;
  };
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
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

export default function JokeCard({ joke, selectable = false, selected = false, onToggleSelect, onDelete }: JokeCardProps) {
  const status = joke.status ?? "pending";
  const sourceLabel = sourceLabels[joke.source] ?? joke.source;
  const [deleting, setDeleting] = useState(false);

  if (!joke._id) {
    return (
      <div className="rounded-lg border border-gray-300 bg-white p-6 shadow-sm">
        <div className="text-gray-700">Анекдот без ID</div>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(joke._id!);
    } else if (!selectable) {
      // Если не в режиме выбора, открываем конструктор при клике на контейнер
      window.location.href = `/dashboard?jokeId=${joke._id}`;
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!joke._id) return;

    const confirmed = confirm("Вы уверены, что хотите удалить этот анекдот? Он будет помечен как удаленный и не будет отображаться в списке.");
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/jokes/${joke._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось удалить анекдот");
      }

      // Вызываем callback для обновления списка
      if (onDelete) {
        onDelete(joke._id);
      } else {
        // Если callback не передан, просто перезагружаем страницу
        window.location.reload();
      }
    } catch (err) {
      alert(`Ошибка удаления: ${err instanceof Error ? err.message : "Произошла ошибка"}`);
      console.error("Failed to delete joke:", err);
    } finally {
      setDeleting(false);
    }
  };

  const content = (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm transition-all ${
        selectable
          ? selected
            ? 'border-purple-500 border-2 bg-purple-50 shadow-md'
            : 'border-gray-300 hover:border-purple-300 hover:shadow-md'
          : 'border-gray-300 hover:shadow-md'
      } cursor-pointer`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(joke._id!)}
            className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex items-center justify-between gap-3 flex-1">
          <h3 className="text-base font-medium text-gray-900 flex-1">
            {joke.title || joke.text.substring(0, 100) + (joke.text.length > 100 ? "..." : "")}
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${statusColors[status] ?? statusColors.pending}`}
            >
              {statusLabels[status] ?? status}
            </span>
            {!selectable && (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/dashboard?jokeId=${joke._id}`}
                  className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 whitespace-nowrap"
                  title="Конструктор видео"
                >
                  🎬 Конструктор
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting || joke.status === "deleted"}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed"
                  title="Удалить анекдот"
                >
                  {deleting ? "..." : joke.status === "deleted" ? "Удалено" : "🗑️"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return content;
}

