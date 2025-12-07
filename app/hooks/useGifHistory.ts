"use client";

import { useState, useEffect } from "react";

const GIF_HISTORY_KEY = "gif_history";
const MAX_HISTORY_SIZE = 20;

export function useGifHistory() {
  const [history, setHistory] = useState<string[]>([]);

  // Загружаем историю из localStorage при монтировании
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GIF_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to load GIF history:", error);
    }
  }, []);

  // Добавляем URL в историю
  const addToHistory = (url: string) => {
    if (!url || url.trim() === "") return;

    setHistory((prev) => {
      // Убираем дубликаты и добавляем новый URL в начало
      const filtered = prev.filter((item) => item !== url);
      const updated = [url, ...filtered].slice(0, MAX_HISTORY_SIZE);

      // Сохраняем в localStorage
      try {
        localStorage.setItem(GIF_HISTORY_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save GIF history:", error);
      }

      return updated;
    });
  };

  // Очищаем историю
  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(GIF_HISTORY_KEY);
    } catch (error) {
      console.error("Failed to clear GIF history:", error);
    }
  };

  return { history, addToHistory, clearHistory };
}
