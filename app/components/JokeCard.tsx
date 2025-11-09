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
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
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

export default function JokeCard({ joke, selectable = false, selected = false, onToggleSelect }: JokeCardProps) {
  const status = joke.status ?? "pending";
  const sourceLabel = sourceLabels[joke.source] ?? joke.source;

  if (!joke._id) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-gray-500">Анекдот без ID</div>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(joke._id!);
    }
  };

  const content = (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm transition-all cursor-pointer ${
        selectable
          ? selected
            ? 'border-purple-500 border-2 bg-purple-50 shadow-md'
            : 'border-gray-200 hover:border-purple-300 hover:shadow-md'
          : 'border-gray-200 hover:shadow-md'
      }`}
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
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${statusColors[status] ?? statusColors.pending}`}
          >
            {statusLabels[status] ?? status}
          </span>
        </div>
      </div>
    </div>
  );

  if (selectable) {
    return content;
  }

  return (
    <Link href={`/jokes/${joke._id}`}>
      {content}
    </Link>
  );
}

