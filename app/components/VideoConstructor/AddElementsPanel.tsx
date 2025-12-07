"use client";

import { useModal } from "@/app/contexts/ModalContext";

interface AddElementsPanelProps {
  onAddText: () => void;
  onAddSubscribe: () => void;
  onAddEmoji: () => void;
  onAddGif: () => void;
  onClearAll: () => void;
}

export default function AddElementsPanel({
  onAddText,
  onAddSubscribe,
  onAddEmoji,
  onAddGif,
  onClearAll,
}: AddElementsPanelProps) {
  const { showModal } = useModal();

  const handleClearAll = () => {
    showModal({
      title: "Подтверждение",
      message: "Очистить все элементы и начать заново?",
      type: "warning",
      isConfirmDialog: true,
      onConfirm: onClearAll,
    });
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

      <div className="flex gap-3 flex-wrap">
        {/* Add Text Button - Beautiful Square */}
        <button
          onClick={onAddText}
          className="w-21 h-21 border-2 border-blue-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center hover:scale-110 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm hover:shadow-md"
          title="Add Text"
        >
          <span className="text-3xl font-bold">A</span>
        </button>

        {/* Add Subscribe Button - Beautiful Square */}
        <button
          onClick={onAddSubscribe}
          className="w-21 h-21 border-2 border-red-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all flex flex-col items-center justify-center hover:scale-110 bg-gradient-to-br from-red-50 to-orange-50 shadow-sm hover:shadow-md gap-0.5"
          title="Add Subscribe"
        >
          <span className="text-2xl">🔔</span>
        </button>

        {/* Add Emoji Button - Beautiful Square */}
        <button
          onClick={onAddEmoji}
          className="w-21 h-21 border-2 border-purple-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all flex items-center justify-center hover:scale-110 bg-gradient-to-br from-purple-50 to-pink-50 shadow-sm hover:shadow-md"
          title="Add Emoji"
        >
          <span className="text-2xl">😊</span>
        </button>

        {/* Add GIF Button - Beautiful Square */}
        <button
          onClick={onAddGif}
          className="w-21 h-21 border-2 border-green-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all flex items-center justify-center hover:scale-110 bg-gradient-to-br from-green-50 to-emerald-50 shadow-sm hover:shadow-md"
          title="Add GIF"
        >
          <span className="text-2xl font-bold">GIF</span>
        </button>
      </div>
    </div>
  );
}
