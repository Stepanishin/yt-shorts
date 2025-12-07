"use client";

import { useState, useEffect, useRef } from "react";
import { useGifHistory } from "@/app/hooks/useGifHistory";

interface GifElementData {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GifElementProps {
  element: GifElementData;
  previewScale: number;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<GifElementData>) => void;
  onDelete: (id: string) => void;
}

export default function GifElement({
  element,
  previewScale,
  isSelected,
  onDragStart,
  onSelect,
  onUpdate,
  onDelete,
}: GifElementProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const { history, addToHistory } = useGifHistory();

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
        setShowEdit(false);
        setShowHistoryDropdown(false);
      }
    };

    if (showDropdown || showEdit || showHistoryDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showDropdown, showEdit, showHistoryDropdown]);

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

    if (!draggedRef.current) {
      setShowDropdown(!showDropdown);
      onSelect(element.id);
    }

    draggedRef.current = false;
    mouseDownPosRef.current = null;
  };

  const handleEdit = () => {
    setShowEdit(true);
    setShowDropdown(false);
    setShowHistoryDropdown(false);
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
      data-gif-element
    >
      <div
        className={`cursor-move relative ${
          isSelected ? "ring-2 ring-purple-500 rounded" : ""
        }`}
        style={{
          width: element.width * previewScale,
          height: element.height * previewScale,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onClick={handleClick}
      >
        <img
          src={element.url}
          alt="GIF"
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          data-gif-dropdown
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
          data-gif-edit
          className="absolute top-full left-0 mt-2 bg-white border-2 border-purple-500 rounded-lg shadow-xl z-50 p-4 min-w-[280px] max-h-[400px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Edit GIF</h3>
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
            {/* GIF URL */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-gray-700">
                  GIF URL
                </label>
                {history.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHistoryDropdown(!showHistoryDropdown);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    {showHistoryDropdown ? "Скрыть историю" : "История"}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={element.url}
                onChange={(e) => {
                  onUpdate(element.id, { url: e.target.value });
                }}
                onBlur={() => {
                  // Сохраняем в историю при потере фокуса
                  if (element.url && element.url.trim() !== "") {
                    addToHistory(element.url);
                  }
                }}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                placeholder="https://..."
                onClick={(e) => e.stopPropagation()}
              />

              {/* History Dropdown */}
              {showHistoryDropdown && history.length > 0 && (
                <div className="mt-2 border border-gray-300 rounded bg-gray-50 max-h-40 overflow-y-auto">
                  <div className="text-xs font-medium text-gray-600 px-2 py-1 border-b bg-gray-100">
                    Ранее использованные:
                  </div>
                  {history.map((url, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdate(element.id, { url });
                        addToHistory(url);
                        setShowHistoryDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 border-b border-gray-200 last:border-b-0 truncate"
                      title={url}
                    >
                      {url}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Width Slider */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Width: {element.width}px
              </label>
              <input
                type="range"
                min="50"
                max="400"
                value={element.width}
                onChange={(e) =>
                  onUpdate(element.id, { width: parseInt(e.target.value) })
                }
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Height Slider */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Height: {element.height}px
              </label>
              <input
                type="range"
                min="50"
                max="400"
                value={element.height}
                onChange={(e) =>
                  onUpdate(element.id, { height: parseInt(e.target.value) })
                }
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
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
