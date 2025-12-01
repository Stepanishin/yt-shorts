"use client";

import { useState } from "react";

interface ProgressIndicatorProps {
  backgroundUrl: string;
  audioUrl: string;
  hasElements: boolean;
  elementsCount: {
    text: number;
    subscribe: number;
    emoji: number;
  };
  renderedVideoUrl: string;
}

export default function ProgressIndicator({
  backgroundUrl,
  audioUrl,
  hasElements,
  elementsCount,
  renderedVideoUrl,
}: ProgressIndicatorProps) {
  // Инициализируем состояние из localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    const savedState = localStorage.getItem("progressIndicatorExpanded");
    return savedState !== null ? savedState === "true" : true;
  });

  // Сохранять состояние в localStorage при изменении
  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem("progressIndicatorExpanded", String(newState));
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Прогресс создания shorts
        </h3>
        <button
          onClick={toggleExpanded}
          className="text-gray-500 hover:text-gray-700 transition-colors p-1"
          aria-label={isExpanded ? "Свернуть" : "Развернуть"}
        >
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {/* Шаг 1: Фон */}
          <div
            className={`flex items-center gap-3 p-2 rounded ${
              backgroundUrl ? "bg-green-50" : "bg-gray-50"
            }`}
          >
            <div
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                backgroundUrl
                  ? "bg-green-500 text-white"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              {backgroundUrl ? "✓" : "1"}
            </div>
            <div className="flex-1">
              <div
                className={`text-sm font-medium ${
                  backgroundUrl ? "text-green-900" : "text-gray-700"
                }`}
              >
                Добавить фон
              </div>
              <div className="text-xs text-gray-500">
                {backgroundUrl
                  ? "Фон загружен"
                  : "Сгенерируйте или загрузите видео/изображение"}
              </div>
            </div>
          </div>

          {/* Шаг 2: Аудио */}
          <div
            className={`flex items-center gap-3 p-2 rounded ${
              audioUrl ? "bg-green-50" : "bg-gray-50"
            }`}
          >
            <div
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                audioUrl
                  ? "bg-green-500 text-white"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              {audioUrl ? "✓" : "2"}
            </div>
            <div className="flex-1">
              <div
                className={`text-sm font-medium ${
                  audioUrl ? "text-green-900" : "text-gray-700"
                }`}
              >
                Добавить аудио (опционально)
              </div>
              <div className="text-xs text-gray-500">
                {audioUrl
                  ? "Аудио загружено"
                  : "Сгенерируйте или загрузите музыку"}
              </div>
            </div>
          </div>

          {/* Шаг 3: Элементы */}
          <div
            className={`flex items-center gap-3 p-2 rounded ${
              hasElements ? "bg-green-50" : "bg-gray-50"
            }`}
          >
            <div
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                hasElements
                  ? "bg-green-500 text-white"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              {hasElements ? "✓" : "3"}
            </div>
            <div className="flex-1">
              <div
                className={`text-sm font-medium ${
                  hasElements ? "text-green-900" : "text-gray-700"
                }`}
              >
                Добавить элементы (опционально)
              </div>
              <div className="text-xs text-gray-500">
                {hasElements
                  ? `${elementsCount.text} текст, ${elementsCount.subscribe} subscribe, ${elementsCount.emoji} эмодзи`
                  : "Добавьте текст, эмодзи или кнопку подписки"}
              </div>
            </div>
          </div>

          {/* Шаг 4: Рендеринг */}
          <div
            className={`flex items-center gap-3 p-2 rounded ${
              renderedVideoUrl ? "bg-green-50" : "bg-gray-50"
            }`}
          >
            <div
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                renderedVideoUrl
                  ? "bg-green-500 text-white"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              {renderedVideoUrl ? "✓" : "4"}
            </div>
            <div className="flex-1">
              <div
                className={`text-sm font-medium ${
                  renderedVideoUrl ? "text-green-900" : "text-gray-700"
                }`}
              >
                Создать видео
              </div>
              <div className="text-xs text-gray-500">
                {renderedVideoUrl
                  ? "Видео готово!"
                  : 'Нажмите "Создать shorts" для финального рендеринга'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
