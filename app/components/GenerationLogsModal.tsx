"use client";

import { useEffect, useRef } from "react";

interface GenerationLogsModalProps {
  isOpen: boolean;
  title: string;
  logs: string[];
  isComplete: boolean;
  hasError: boolean;
}

export default function GenerationLogsModal({
  isOpen,
  title,
  logs,
  isComplete,
  hasError,
}: GenerationLogsModalProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Автоскролл к последнему логу
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black opacity-70" />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{title}</h2>
            {!isComplete && (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                <span className="text-sm text-gray-600">Обработка...</span>
              </div>
            )}
            {isComplete && !hasError && (
              <span className="text-green-600 font-medium">✓ Завершено</span>
            )}
            {hasError && (
              <span className="text-red-600 font-medium">✗ Ошибка</span>
            )}
          </div>
        </div>

        {/* Logs area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <div className="space-y-2 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-gray-500 italic">Инициализация...</div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 rounded ${
                    log.startsWith("✅")
                      ? "bg-green-50 text-green-800"
                      : log.startsWith("❌") || log.startsWith("⚠️")
                      ? "bg-red-50 text-red-800"
                      : log.startsWith("💰") || log.startsWith("💳")
                      ? "bg-blue-50 text-blue-800"
                      : log.startsWith("🎬") || log.startsWith("🎵") || log.startsWith("🎨")
                      ? "bg-purple-50 text-purple-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer with info */}
        <div className="p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-600">
            {!isComplete && "Пожалуйста, подождите. Не закрывайте эту страницу."}
            {isComplete && !hasError && "Процесс успешно завершен!"}
            {hasError && "Произошла ошибка. Проверьте логи выше."}
          </p>
        </div>
      </div>
    </div>
  );
}
