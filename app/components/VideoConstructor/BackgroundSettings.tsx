"use client";

interface BackgroundSettingsProps {
  videoDuration: number;
  backgroundType: "video" | "image";
  backgroundUrl: string;
  backgroundModel: "ray-v1" | "hailuo-t2v-01" | "luma-direct";
  backgroundPrompt: string;
  imageEffect: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left";
  audioUrl: string;
  audioModel: "llm";
  audioPrompt: string;
  generatingBackground: boolean;
  generatingAudio: boolean;
  onVideoDurationChange: (duration: number) => void;
  onBackgroundTypeChange: (type: "video" | "image") => void;
  onBackgroundUrlChange: (url: string) => void;
  onBackgroundModelChange: (model: "ray-v1" | "hailuo-t2v-01" | "luma-direct") => void;
  onBackgroundPromptChange: (prompt: string) => void;
  onImageEffectChange: (effect: "none" | "zoom-in" | "zoom-in-out" | "pan-right-left") => void;
  onAudioUrlChange: (url: string) => void;
  onAudioModelChange: (model: "llm") => void;
  onAudioPromptChange: (prompt: string) => void;
  onGenerateBackground: () => void;
  onGenerateAudio: () => void;
}

export default function BackgroundSettings({
  videoDuration,
  backgroundType,
  backgroundUrl,
  backgroundModel,
  backgroundPrompt,
  imageEffect,
  audioUrl,
  audioModel,
  audioPrompt,
  generatingBackground,
  generatingAudio,
  onVideoDurationChange,
  onBackgroundTypeChange,
  onBackgroundUrlChange,
  onBackgroundModelChange,
  onBackgroundPromptChange,
  onImageEffectChange,
  onAudioUrlChange,
  onAudioModelChange,
  onAudioPromptChange,
  onGenerateBackground,
  onGenerateAudio,
}: BackgroundSettingsProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-3 text-gray-900">
        Фон и настройки
      </h2>
      <div className="space-y-3">
        {/* Video Duration */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900">
            Длительность видео
          </label>
          <select
            value={videoDuration}
            onChange={(e) => onVideoDurationChange(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
          >
            <option value={5}>5 секунд</option>
            <option value={10}>10 секунд</option>
            <option value={15}>15 секунд</option>
            <option value={20}>20 секунд</option>
            <option value={30}>30 секунд</option>
          </select>
        </div>

        {/* Background Type */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900">
            Тип фона
          </label>
          <select
            value={backgroundType}
            onChange={(e) =>
              onBackgroundTypeChange(e.target.value as "video" | "image")
            }
            className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
          >
            <option value="video">Видео</option>
            <option value="image">Изображение</option>
          </select>
        </div>

        {/* Background URL */}
        <div className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50">
          <label className="block text-sm font-bold mb-2 text-purple-900">
            📹 Шаг 1: Добавить фон (обязательно)
          </label>

          {/* AI Generation - только для видео */}
          {backgroundType === "video" && (
            <>
              {/* AI Generation Button - Prominent */}
              <button
                onClick={onGenerateBackground}
                disabled={generatingBackground}
                className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {generatingBackground ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    Генерация фона...
                  </>
                ) : (
                  <>
                    <span className="text-lg">🤖</span>
                    Сгенерировать фон через AI
                  </>
                )}
              </button>

              {/* Model Selection */}
              <div className="mb-2">
                <label className="block text-xs font-medium mb-1 text-gray-700">
                  Модель AI:
                </label>
                <select
                  value={backgroundModel}
                  onChange={(e) =>
                    onBackgroundModelChange(
                      e.target.value as "ray-v1" | "hailuo-t2v-01" | "luma-direct"
                    )
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 bg-white"
                >
                  <option value="luma-direct">
                    ⚡ Luma Flash (25 кредитов / $0.25) - БЫСТРО
                  </option>
                  <option value="ray-v1">
                    Luma Ray v1 (35 кредитов / $0.35)
                  </option>
                  <option value="hailuo-t2v-01">
                    Hailuo T2V-01 (35 кредитов / $0.35)
                  </option>
                </select>
              </div>

              {/* Prompt */}
              <div className="mb-3">
                <label className="block text-xs font-medium mb-1 text-gray-700">
                  Описание фона (опционально):
                </label>
                <textarea
                  value={backgroundPrompt}
                  onChange={(e) => onBackgroundPromptChange(e.target.value)}
                  placeholder="Например: 'Красивый закат на пляже' (если пусто, используется текст из элементов)"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none text-gray-900 bg-white"
                  rows={2}
                />
              </div>
            </>
          )}

          {/* Image Effect - показываем только когда выбрано изображение */}
          {backgroundType === "image" && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-xs font-bold mb-2 text-blue-900">
                ✨ Эффект для изображения (Ken Burns)
              </label>
              <select
                value={imageEffect}
                onChange={(e) =>
                  onImageEffectChange(
                    e.target.value as "none" | "zoom-in" | "zoom-in-out" | "pan-right-left"
                  )
                }
                className="w-full border border-gray-300 rounded px-2 py-2 text-sm text-gray-900 bg-white"
              >
                <option value="none">Без эффекта (статичное)</option>
                <option value="zoom-in">🔍 Zoom In (приближение)</option>
                <option value="zoom-in-out">🔄 Zoom In-Out (приближение-отдаление)</option>
                <option value="pan-right-left">↔️ Pan Right-Left (вправо-влево)</option>
              </select>
              <p className="text-xs text-gray-600 mt-2">
                Эффект применяется без AI - простая анимация камеры
              </p>
            </div>
          )}

          {/* Manual URL */}
          {backgroundType === "video" ? (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer hover:text-gray-800 font-medium mb-2">
                Или вставить готовый URL фона
              </summary>
              <input
                type="text"
                value={backgroundUrl}
                onChange={(e) => onBackgroundUrlChange(e.target.value)}
                placeholder="https://..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 bg-white"
              />
            </details>
          ) : (
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                URL изображения:
              </label>
              <input
                type="text"
                value={backgroundUrl}
                onChange={(e) => onBackgroundUrlChange(e.target.value)}
                placeholder="https://... (ссылка на изображение)"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Вставьте ссылку на изображение (JPG, PNG, WebP)
              </p>
            </div>
          )}
        </div>

        {/* Audio URL */}
        <div className="border-2 border-indigo-200 rounded-lg p-3 bg-indigo-50">
          <label className="block text-sm font-bold mb-2 text-indigo-900">
            🎵 Шаг 2: Добавить аудио (опционально)
          </label>

          {/* AI Generation Button - Prominent */}
          <button
            onClick={onGenerateAudio}
            disabled={generatingAudio}
            className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {generatingAudio ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Генерация аудио...
              </>
            ) : (
              <>
                <span className="text-lg">🎵</span>
                Сгенерировать аудио через AI
              </>
            )}
          </button>

          {/* Model Selection */}
          <div className="mb-2">
            <label className="block text-xs font-medium mb-1 text-gray-700">
              Модель AI:
            </label>
            <select
              value={audioModel}
              onChange={(e) => onAudioModelChange(e.target.value as "llm")}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 bg-white"
            >
              <option value="llm">Udio (10 кредитов / $0.10)</option>
            </select>
          </div>

          {/* Prompt */}
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1 text-gray-700">
              Описание музыки (опционально):
            </label>
            <textarea
              value={audioPrompt}
              onChange={(e) => onAudioPromptChange(e.target.value)}
              placeholder="Например: 'Веселая энергичная музыка' (если пусто, используется текст из элементов)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none text-gray-900 bg-white"
              rows={2}
            />
          </div>

          {/* Manual URL - Less Prominent */}
          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer hover:text-gray-800 font-medium mb-2">
              Или вставить готовый URL аудио
            </summary>
            <input
              type="text"
              value={audioUrl}
              onChange={(e) => onAudioUrlChange(e.target.value)}
              placeholder="https://... (MP3 или другой аудио формат)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 bg-white"
            />
          </details>
        </div>
      </div>
    </div>
  );
}
