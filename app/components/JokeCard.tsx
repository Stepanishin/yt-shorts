"use client";

import Link from "next/link";

interface JokeCardProps {
  joke: {
    _id?: string;
    source: string;
    title?: string;
    text: string;
    category?: string;
    status?: "pending" | "reserved" | "used" | "rejected";
    ratingPercent?: number;
    votesTotal?: number;
    createdAt?: string;
  };
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

export default function JokeCard({ joke }: JokeCardProps) {
  const status = joke.status ?? "pending";
  const sourceLabel = sourceLabels[joke.source] ?? joke.source;

  if (!joke._id) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-gray-500">Анекдот без ID</div>
      </div>
    );
  }

  return (
    <Link href={`/jokes/${joke._id}`}>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-medium text-gray-900 flex-1">
            {joke.title || joke.text.substring(0, 100) + (joke.text.length > 100 ? "..." : "")}
          </h3>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${statusColors[status] ?? statusColors.pending}`}
          >
            {statusLabels[status] ?? status}
          </span>
        </div>
      </div>
    </Link>
  );
}

