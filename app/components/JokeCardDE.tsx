"use client";

import Link from "next/link";

interface JokeCardDEProps {
  joke: {
    _id?: string;
    source: string;
    title?: string;
    text: string;
    category?: string;
    status?: "pending" | "reserved" | "used" | "rejected";
    ratingPercent?: number;
    createdAt?: string;
  };
}

export default function JokeCardDE({ joke }: JokeCardDEProps) {
  const sourceLabels: Record<string, string> = {
    jokeapi: "JokeAPI",
    aberwitzig: "Aberwitzig.com",
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
    <Link href={`/dashboard/jokes-de/${joke._id}`}>
      <div className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">
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
          <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
            {joke.title}
          </h3>
        )}

        <p className="text-sm text-gray-700 line-clamp-3">{joke.text}</p>

        {joke.ratingPercent !== undefined && (
          <div className="mt-3 text-xs text-gray-500">
            Рейтинг: {joke.ratingPercent}%
          </div>
        )}
      </div>
    </Link>
  );
}
