"use client";

interface BackgroundSettingsProps {
  videoDuration: number;
  backgroundType: "video" | "image";
  backgroundUrl: string;
  backgroundModel: "ray-v1" | "hailuo-t2v-01" | "luma-direct";
  backgroundPrompt: string;
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
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900">
            URL фона
          </label>
          <div className="flex gap-2 mb-2">
            <select
              value={backgroundModel}
              onChange={(e) =>
                onBackgroundModelChange(
                  e.target.value as "ray-v1" | "hailuo-t2v-01" | "luma-direct"
                )
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              title="Модель для генерации фона"
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

          <div className="mb-2">
            <textarea
              value={backgroundPrompt}
              onChange={(e) => onBackgroundPromptChange(e.target.value)}
              placeholder="Опционально: описание фона для AI (если пусто, используется текст из элементов)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none text-gray-900"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={backgroundUrl}
              onChange={(e) => onBackgroundUrlChange(e.target.value)}
              placeholder="https://..."
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-gray-900"
            />
            <button
              onClick={onGenerateBackground}
              disabled={generatingBackground}
              className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 text-sm whitespace-nowrap"
              title="Генерировать через AI"
            >
              {generatingBackground ? "⏳" : "🤖 AI"}
            </button>
          </div>
        </div>

        {/* Audio URL */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900">
            URL аудио (опционально)
          </label>
          <div className="flex gap-2 mb-2">
            <select
              value={audioModel}
              onChange={(e) => onAudioModelChange(e.target.value as "llm")}
              className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              title="Модель для генерации аудио"
            >
              <option value="llm">Udio (10 кредитов)</option>
            </select>
          </div>

          <div className="mb-2">
            <textarea
              value={audioPrompt}
              onChange={(e) => onAudioPromptChange(e.target.value)}
              placeholder="Опционально: описание музыки для AI (если пусто, используется текст из элементов)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none text-gray-900"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={audioUrl}
              onChange={(e) => onAudioUrlChange(e.target.value)}
              placeholder="https://..."
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-gray-900"
            />
            <button
              onClick={onGenerateAudio}
              disabled={generatingAudio}
              className="px-3 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-400 text-sm whitespace-nowrap"
              title="Генерировать через AI"
            >
              {generatingAudio ? "⏳" : "🎵 AI"}
            </button>
          </div>
          <p className="text-xs text-gray-700 mt-1">
            MP3 или другой аудио формат
          </p>
        </div>
      </div>
    </div>
  );
}
