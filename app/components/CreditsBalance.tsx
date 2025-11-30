"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { loadStripe } from "@stripe/stripe-js";

export default function CreditsBalance() {
  const { data: session, update: updateSession } = useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState<number>(500); // По умолчанию 5 евро
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    // Используем кредиты из сессии если есть
    if (session?.user?.credits !== undefined) {
      setCredits(session.user.credits);
      setLoading(false);
    } else {
      fetchCredits();
    }

    // Проверяем URL параметры для успешной оплаты
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      // Обновляем баланс после успешной оплаты
      setTimeout(() => {
        fetchCredits();
        updateSession(); // Обновляем сессию
      }, 1000);
    }
  }, [session]);

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
    if (topUpAmount < 100) {
      alert("Минимальная сумма пополнения: €1.00 (100 кредитов)");
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
              onClick={() => setTopUpAmount(500)}
              className={`px-3 py-2 rounded ${
                topUpAmount === 500
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              500 (€5)
            </button>
            <button
              onClick={() => setTopUpAmount(1000)}
              className={`px-3 py-2 rounded ${
                topUpAmount === 1000
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              1000 (€10)
            </button>
            <button
              onClick={() => setTopUpAmount(2000)}
              className={`px-3 py-2 rounded ${
                topUpAmount === 2000
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              2000 (€20)
            </button>
          </div>

          <input
            type="number"
            min="100"
            step="100"
            value={topUpAmount}
            onChange={(e) => setTopUpAmount(parseInt(e.target.value) || 100)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
          />
          <p className="text-xs text-gray-700 mt-1">
            ≈ €{(topUpAmount / 100).toFixed(2)} (минимум €1.00)
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
