"use client";

import { useState, useEffect, useRef } from "react";

interface EmojiElementData {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  animation: "none" | "pulse" | "rotate" | "bounce" | "fade";
}

interface EmojiElementProps {
  element: EmojiElementData;
  previewScale: number;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<EmojiElementData>) => void;
  onDelete: (id: string) => void;
}

const AVAILABLE_EMOJIS = {
  main: ["😂", "❤️", "🔥", "👍", "🎉", "⭐", "💯", "✨"],
  subscribe: ["👇", "☝️", "👉", "👈", "🔔", "▶️", "📺", "🎬"],
};

export default function EmojiElement({
  element,
  previewScale,
  isSelected,
  onDragStart,
  onSelect,
  onUpdate,
  onDelete,
}: EmojiElementProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Проверяем, что клик был вне нашего контейнера
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
        setShowEdit(false);
      }
    };

    // Добавляем обработчик только если открыт dropdown или edit
    if (showDropdown || showEdit) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showDropdown, showEdit]);

  // Отслеживание перемещения мыши для определения перетаскивания
  useEffect(() => {
    const handleMouseMove = () => {
      if (mouseDownPosRef.current) {
        draggedRef.current = true;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    mouseDownPosRef.current = { x: clientX, y: clientY };
    draggedRef.current = false;
    onDragStart(e, element.id);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Открываем dropdown только если элемент не перетаскивался
    if (!draggedRef.current) {
      setShowDropdown(!showDropdown);
      onSelect(element.id);
    }

    // Сбрасываем флаг
    draggedRef.current = false;
    mouseDownPosRef.current = null;
  };

  const handleEdit = () => {
    setShowEdit(true);
    setShowDropdown(false);
  };

  const handleDelete = () => {
    onDelete(element.id);
    setShowDropdown(false);
  };

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: element.x * previewScale,
        top: element.y * previewScale,
      }}
      data-emoji-element
    >
      <div
        className={`cursor-move relative ${
          isSelected ? "ring-2 ring-green-500 rounded" : ""
        }`}
        style={{
          fontSize: element.size * previewScale,
          lineHeight: 1,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onClick={handleClick}
      >
        {element.emoji}
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          data-emoji-dropdown
          className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[120px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleEdit}
            className="w-full px-4 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 flex items-center gap-2 rounded-t-lg"
          >
            <span>✏️</span> Edit
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-200 rounded-b-lg"
          >
            <span>🗑️</span> Delete
          </button>
        </div>
      )}

      {/* Edit Settings Panel */}
      {showEdit && (
        <div
          data-emoji-edit
          className="absolute top-full left-0 mt-2 bg-white border-2 border-blue-500 rounded-lg shadow-xl z-50 p-4 min-w-[280px] max-h-[400px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Edit Emoji</h3>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowEdit(false);
              }}
              className="text-gray-500 hover:text-gray-700 text-xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="space-y-3">
            {/* Emoji Select */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Emoji
              </label>
              <select
                value={element.emoji}
                onChange={(e) =>
                  onUpdate(element.id, { emoji: e.target.value })
                }
                className="w-full border border-gray-300 rounded px-2 py-2 text-2xl text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <optgroup label="Main Emojis">
                  {AVAILABLE_EMOJIS.main.map((emoji) => (
                    <option key={emoji} value={emoji}>
                      {emoji}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Subscribe Actions">
                  {AVAILABLE_EMOJIS.subscribe.map((emoji) => (
                    <option key={emoji} value={emoji}>
                      {emoji}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Size Slider */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Size: {element.size}px
              </label>
              <input
                type="range"
                min="40"
                max="200"
                value={element.size}
                onChange={(e) =>
                  onUpdate(element.id, { size: parseInt(e.target.value) })
                }
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Animation Select */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Animation
              </label>
              <select
                value={element.animation}
                onChange={(e) =>
                  onUpdate(element.id, {
                    animation: e.target.value as EmojiElementData["animation"],
                  })
                }
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="none">No Animation</option>
                <option value="pulse">Pulse</option>
                <option value="rotate">Rotate</option>
                <option value="bounce">Bounce</option>
                <option value="fade">Fade In</option>
              </select>
            </div>

            {/* Position Info */}
            <div className="text-xs text-gray-600 pt-2 border-t">
              Position: X: {element.x.toFixed(0)}, Y: {element.y.toFixed(0)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
