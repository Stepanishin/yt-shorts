"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { loadStripe } from "@stripe/stripe-js";

export default function CreditsBalance() {
  const { data: session, update: updateSession } = useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState<number>(50); // По умолчанию 0.50 евро (минимум Stripe)
  const [processing, setProcessing] = useState(false);
  const [paymentProcessed, setPaymentProcessed] = useState(false); // Флаг для предотвращения повторной обработки

  useEffect(() => {
    // Используем кредиты из сессии если есть
    if (session?.user?.credits !== undefined) {
      setCredits(session.user.credits);
      setLoading(false);
    } else {
      fetchCredits();
    }
  }, [session]);

  useEffect(() => {
    // Проверяем URL параметры для успешной оплаты (только один раз)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success' && !paymentProcessed) {
      setPaymentProcessed(true);

      // Обновляем баланс после успешной оплаты
      setTimeout(() => {
        fetchCredits();
        updateSession(); // Обновляем сессию

        // Убираем параметр payment из URL
        const url = new URL(window.location.href);
        url.searchParams.delete('payment');
        window.history.replaceState({}, '', url);
      }, 1000);
    }
  }, [paymentProcessed]);

  const fetchCredits = async () => {
    try {
      const response = await fetch("/api/user/credits");
      if (response.ok) {
        const data = await response.json();
        setCredits(data.credits);
      }
    } catch (error) {
      console.error("Error fetching credits:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    if (topUpAmount < 50) {
      alert("Минимальная сумма пополнения: €0.50 (50 кредитов) - ограничение Stripe");
      return;
    }

    setProcessing(true);

    try {
      // Создаем Stripe checkout session
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: topUpAmount }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { url } = await response.json();

      // Перенаправляем на страницу оплаты Stripe
      window.location.href = url;
    } catch (error) {
      console.error("Error creating checkout session:", error);
      alert("Ошибка при создании сессии оплаты");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="text-gray-800">Загрузка баланса...</div>;
  }

  const creditsInEuros = (credits || 0) / 100;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900">Баланс кредитов</h2>

      <div className="mb-6">
        <div className="text-3xl font-bold text-blue-600 mb-2">
          {credits !== null ? credits : "—"} кредитов
        </div>
        <div className="text-sm text-gray-800">
          ≈ €{creditsInEuros.toFixed(2)}
        </div>
      </div>

      <div className="border-t pt-4 mb-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Стоимость операций</h3>
        <ul className="text-xs text-gray-800 space-y-1">
          <li>• Генерация видео-фона (Luma Ray v1): 35 кредитов (€0.35)</li>
          <li>• Генерация аудио (Udio): 10 кредитов (€0.10)</li>
          <li>• Рендеринг видео: бесплатно</li>
        </ul>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold mb-3 text-gray-900">Пополнить баланс</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-900">
            Сумма пополнения (кредиты)
          </label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setTopUpAmount(50)}
              className={`px-3 py-2 rounded ${
                topUpAmount === 50
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              50 (€0.50)
            </button>
            <button
              onClick={() => setTopUpAmount(100)}
              className={`px-3 py-2 rounded ${
                topUpAmount === 100
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              100 (€1)
            </button>
            <button
              onClick={() => setTopUpAmount(500)}
              className={`px-3 py-2 rounded ${
                topUpAmount === 500
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              500 (€5)
            </button>
          </div>

          <input
            type="number"
            min="50"
            step="10"
            value={topUpAmount}
            onChange={(e) => setTopUpAmount(parseInt(e.target.value) || 50)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
          />
          <p className="text-xs text-gray-700 mt-1">
            ≈ €{(topUpAmount / 100).toFixed(2)} (минимум €0.50)
          </p>
        </div>

        <button
          onClick={handleTopUp}
          disabled={processing}
          className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {processing ? "Обработка..." : "Пополнить через Stripe"}
        </button>
      </div>
    </div>
  );
}
