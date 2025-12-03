"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Transaction {
  _id?: string;
  userId: string;
  type: "deposit" | "withdrawal";
  amount: number;
  reason: string;
  description?: string;
  metadata?: {
    videoUrl?: string;
    audioUrl?: string;
    renderedVideoUrl?: string;
    prompt?: string;
    modelName?: string;
    stripeSessionId?: string;
    amountPaid?: number;
    currency?: string;
    [key: string]: unknown;
  };
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

interface TransactionStats {
  totalDeposits: number;
  totalWithdrawals: number;
  transactionCount: number;
}

const reasonLabels: Record<string, string> = {
  purchase: "Покупка кредитов",
  video_generation: "Генерация видео",
  background_generation: "Генерация фона",
  audio_generation: "Генерация аудио",
  video_rendering: "Рендеринг видео",
  manual_adjustment: "Ручная корректировка",
  initial_balance: "Начальный баланс",
};

const reasonIcons: Record<string, string> = {
  purchase: "💰",
  video_generation: "🎬",
  background_generation: "🎨",
  audio_generation: "🎵",
  video_rendering: "⚙️",
  manual_adjustment: "✏️",
  initial_balance: "🎁",
};

export default function HistoryPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal">("all");

  useEffect(() => {
    loadHistory();
  }, [filter]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const typeParam = filter !== "all" ? `&type=${filter}` : "";
      const response = await fetch(`/api/user/credits/history?limit=100${typeParam}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить историю транзакций");
      }
      const data = await response.json();
      setTransactions(data.transactions || []);
      setStats(data.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      console.error("Failed to load transaction history:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("ru-RU", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("URL скопирован в буфер обмена!");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Загрузка истории транзакций...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">История транзакций</h1>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="text-red-800 font-medium mb-2">Ошибка</div>
            <div className="text-red-600 text-sm">{error}</div>
          </div>
        )}

        {/* Статистика */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="text-sm text-gray-600 mb-1">Всего пополнений</div>
              <div className="text-2xl font-bold text-green-600">
                +{formatAmount(stats.totalDeposits)} кредитов
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="text-sm text-gray-600 mb-1">Всего потрачено</div>
              <div className="text-2xl font-bold text-red-600">
                -{formatAmount(stats.totalWithdrawals)} кредитов
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="text-sm text-gray-600 mb-1">Всего транзакций</div>
              <div className="text-2xl font-bold text-gray-900">{stats.transactionCount}</div>
            </div>
          </div>
        )}

        {/* Фильтры */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            Все
          </button>
          <button
            onClick={() => setFilter("deposit")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === "deposit"
                ? "bg-green-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            Пополнения
          </button>
          <button
            onClick={() => setFilter("withdrawal")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === "withdrawal"
                ? "bg-red-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            Траты
          </button>
        </div>

        {/* Список транзакций */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Транзакций пока нет
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <div
                  key={transaction._id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="text-2xl">
                        {reasonIcons[transaction.reason] || "💳"}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {reasonLabels[transaction.reason] || transaction.reason}
                        </div>
                        {transaction.description && (
                          <div className="text-sm text-gray-600 mt-1">
                            {transaction.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(transaction.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-lg font-semibold ${
                          transaction.type === "deposit"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {transaction.type === "deposit" ? "+" : "-"}
                        {formatAmount(transaction.amount)} кредитов
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Баланс: {formatAmount(transaction.balanceAfter)} кредитов
                      </div>
                    </div>
                  </div>

                  {/* Медиа-контент и метаданные */}
                  {transaction.metadata && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                      {/* Промпт */}
                      {transaction.metadata.prompt && (
                        <div className="text-sm">
                          <span className="font-medium text-gray-900">Промпт: </span>
                          <span className="text-gray-700">{transaction.metadata.prompt}</span>
                        </div>
                      )}

                      {/* Модель */}
                      {transaction.metadata.modelName && (
                        <div className="text-xs text-gray-600">
                          Модель: {transaction.metadata.modelName}
                        </div>
                      )}

                      {/* Видео */}
                      {transaction.metadata.videoUrl && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-900">
                              Сгенерированное видео:
                            </span>
                            <button
                              onClick={() => copyToClipboard(transaction.metadata!.videoUrl!)}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                            >
                              Копировать URL
                            </button>
                            <a
                              href={transaction.metadata.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                            >
                              Открыть
                            </a>
                          </div>
                          <video
                            src={transaction.metadata.videoUrl}
                            controls
                            className="w-full max-w-md rounded border border-gray-300"
                            style={{ maxHeight: "300px" }}
                          />
                        </div>
                      )}

                      {/* Аудио */}
                      {transaction.metadata.audioUrl && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-900">
                              Сгенерированное аудио:
                            </span>
                            <button
                              onClick={() => copyToClipboard(transaction.metadata!.audioUrl!)}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                            >
                              Копировать URL
                            </button>
                            <a
                              href={transaction.metadata.audioUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                            >
                              Открыть
                            </a>
                          </div>
                          <audio
                            src={transaction.metadata.audioUrl}
                            controls
                            className="w-full max-w-md"
                          />
                        </div>
                      )}

                      {/* Информация о покупке */}
                      {transaction.metadata.amountPaid && (
                        <div className="text-sm text-gray-800">
                          Оплачено: €{transaction.metadata.amountPaid.toFixed(2)}{" "}
                          {transaction.metadata.currency?.toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

