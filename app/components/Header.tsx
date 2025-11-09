"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Header() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkYouTubeAuth();
  }, []);

  const checkYouTubeAuth = async () => {
    try {
      // Проверяем наличие токенов через API
      const response = await fetch("/api/youtube/check-auth");
      if (response.ok) {
        const data = await response.json();
        // Проверяем что есть именно access token, а не только refresh token
        setIsAuthorized(data.hasAccessToken || false);
      }
    } catch (error) {
      console.error("Failed to check YouTube auth:", error);
    } finally {
      setChecking(false);
    }
  };

  const handleAuthorize = () => {
    // Открываем страницу авторизации в новом окне
    const authWindow = window.open("/api/youtube/auth", "_blank", "width=600,height=700");

    // Слушаем событие закрытия окна авторизации
    const checkAuthInterval = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkAuthInterval);
        // Перезагружаем статус авторизации с небольшой задержкой
        setTimeout(() => {
          checkYouTubeAuth();
        }, 500);
      }
    }, 1000);
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="flex items-center justify-between">
          {/* Логотип и название */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="text-2xl">🎬</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Shorts Generator
              </h1>
              <p className="text-xs text-gray-500">
                YouTube Shorts con chistes
              </p>
            </div>
          </Link>

          {/* Кнопка авторизации YouTube */}
          <div className="flex items-center gap-4">
            {checking ? (
              <div className="text-sm text-gray-500">Проверка...</div>
            ) : isAuthorized ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-md">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-green-800">
                  YouTube подключен
                </span>
              </div>
            ) : (
              <button
                onClick={handleAuthorize}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium text-sm"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Подключить YouTube
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
