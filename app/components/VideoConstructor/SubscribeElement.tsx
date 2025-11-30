"use client";

import { useState, useEffect, useRef } from "react";

interface SubscribeElementData {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  boxPadding?: number;
  fontWeight?: "normal" | "bold";
  language: "en" | "es";
}

interface SubscribeElementProps {
  element: SubscribeElementData;
  previewScale: number;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<SubscribeElementData>) => void;
  onDelete: (id: string) => void;
}

export default function SubscribeElement({
  element,
  previewScale,
  isSelected,
  onDragStart,
  onSelect,
  onUpdate,
  onDelete,
}: SubscribeElementProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
        setShowEdit(false);
      }
    };

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

  const handleLanguageChange = (lang: "en" | "es") => {
    onUpdate(element.id, {
      language: lang,
      text: lang === "en" ? "SUBSCRIBE" : "SUSCRÍBETE",
    });
  };

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: element.x * previewScale,
        top: element.y * previewScale,
      }}
      data-subscribe-element
    >
      <div
        className={`cursor-move relative ${
          isSelected ? "ring-2 ring-red-500 rounded" : ""
        }`}
        style={{
          fontSize: element.fontSize * previewScale,
          fontWeight: element.fontWeight || "bold",
          backgroundColor: "rgba(220, 38, 38, 0.9)",
          color: "white",
          padding: (element.boxPadding || 15) * previewScale,
          borderRadius: "4px",
          whiteSpace: "pre-wrap",
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onClick={handleClick}
      >
        {element.text}
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          data-subscribe-dropdown
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
          data-subscribe-edit
          className="absolute top-full left-0 mt-2 bg-white border-2 border-red-500 rounded-lg shadow-xl z-50 p-4 min-w-[280px] max-h-[400px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Edit Subscribe</h3>
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
            {/* Language Selection */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Language
              </label>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLanguageChange("en");
                  }}
                  className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
                    element.language === "en"
                      ? "bg-red-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  EN - SUBSCRIBE
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLanguageChange("es");
                  }}
                  className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
                    element.language === "es"
                      ? "bg-red-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  ES - SUSCRÍBETE
                </button>
              </div>
            </div>

            {/* Font Size Slider */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Font Size: {element.fontSize}px
              </label>
              <input
                type="range"
                min="24"
                max="60"
                value={element.fontSize}
                onChange={(e) =>
                  onUpdate(element.id, { fontSize: parseInt(e.target.value) })
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
