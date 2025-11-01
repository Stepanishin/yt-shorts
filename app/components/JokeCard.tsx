"use client";

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

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">{sourceLabel}</span>
          {joke.category && (
            <span className="text-xs text-gray-500">• {joke.category}</span>
          )}
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[status] ?? statusColors.pending}`}
        >
          {statusLabels[status] ?? status}
        </span>
      </div>

      {joke.title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{joke.title}</h3>
      )}

      <div className="text-gray-700 whitespace-pre-wrap leading-relaxed mb-4">
        {joke.text}
      </div>

      {/* <div className="flex items-center gap-4 text-xs text-gray-500">
        {joke.ratingPercent !== undefined && (
          <span>Рейтинг: {joke.ratingPercent}%</span>
        )}
        {joke.votesTotal !== undefined && joke.votesTotal > 0 && (
          <span>Голосов: {joke.votesTotal}</span>
        )}
        {joke.createdAt && (
          <span>
            Добавлен:{" "}
            {new Date(joke.createdAt).toLocaleDateString("ru-RU", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div> */}
    </div>
  );
}

