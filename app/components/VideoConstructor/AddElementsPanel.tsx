"use client";

interface AddElementsPanelProps {
  onAddText: () => void;
  onAddEmoji: () => void;
  onAddSubscribeEN: () => void;
  onAddSubscribeES: () => void;
  onClearAll: () => void;
}

export default function AddElementsPanel({
  onAddText,
  onAddEmoji,
  onAddSubscribeEN,
  onAddSubscribeES,
  onClearAll,
}: AddElementsPanelProps) {
  const handleClearAll = () => {
    if (confirm("Очистить все элементы и начать заново?")) {
      onClearAll();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Добавить элементы
        </h2>
        <button
          onClick={handleClearAll}
          className="text-xs text-red-600 hover:text-red-800 underline"
        >
          Очистить все
        </button>
      </div>

      <div className="space-y-3">
        {/* Add Text Button */}
        <button
          onClick={onAddText}
          className="w-full bg-blue-500 text-white rounded-lg px-4 py-3 hover:bg-blue-600 font-medium transition-colors shadow-sm hover:shadow-md"
        >
          + Добавить текст
        </button>

        {/* Add Emoji Button - Beautiful Square */}
        <button
          onClick={onAddEmoji}
          className="w-20 h-20 border-2 border-purple-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all flex items-center justify-center hover:scale-110 bg-gradient-to-br from-purple-50 to-pink-50 shadow-sm hover:shadow-md"
          title="Add Emoji"
        >
          <span className="text-2xl">😊</span>
        </button>

        {/* Quick Subscribe Text Buttons */}
        <div className="border-t pt-2 mt-2 space-y-1">
          <p className="text-xs text-gray-800 mb-1 font-medium">Quick Actions:</p>
          <button
            onClick={onAddSubscribeEN}
            className="w-full bg-red-600 text-white rounded px-3 py-1.5 text-sm hover:bg-red-700 font-medium"
          >
            + SUBSCRIBE 👇
          </button>
          <button
            onClick={onAddSubscribeES}
            className="w-full bg-red-600 text-white rounded px-3 py-1.5 text-sm hover:bg-red-700 font-medium"
          >
            + SUSCRÍBETE 👇
          </button>
        </div>
      </div>
    </div>
  );
}
