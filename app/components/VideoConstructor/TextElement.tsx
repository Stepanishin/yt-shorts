"use client";

import { useState, useEffect, useRef } from "react";

interface TextElementData {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  boxPadding?: number;
  fontWeight?: "normal" | "bold";
  width?: number;
}

interface TextElementProps {
  element: TextElementData;
  previewScale: number;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TextElementData>) => void;
  onDelete: (id: string) => void;
}

export default function TextElement({
  element,
  previewScale,
  isSelected,
  onDragStart,
  onSelect,
  onUpdate,
  onDelete,
}: TextElementProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isResizing, setIsResizing] = useState<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; x: number; mouseX: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleResizeStart = (e: React.MouseEvent, side: "left" | "right") => {
    e.stopPropagation();
    e.preventDefault();

    // Устанавливаем флаг что был клик на resize handle
    draggedRef.current = true;

    setIsResizing(side);
    resizeStartRef.current = {
      width: element.width || 400,
      x: element.x,
      mouseX: e.clientX,
    };
  };

  useEffect(() => {
    if (!isResizing || !resizeStartRef.current) return;

    const handleResizeMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!resizeStartRef.current) return;

      const deltaX = (e.clientX - resizeStartRef.current.mouseX) / previewScale;

      if (isResizing === "right") {
        // Изменяем ширину справа
        const newWidth = Math.max(100, resizeStartRef.current.width + deltaX);
        onUpdate(element.id, { width: newWidth });
      } else if (isResizing === "left") {
        // Изменяем ширину слева и сдвигаем позицию
        const newWidth = Math.max(100, resizeStartRef.current.width - deltaX);
        const widthDiff = newWidth - resizeStartRef.current.width;
        onUpdate(element.id, {
          width: newWidth,
          x: resizeStartRef.current.x - widthDiff,
        });
      }
    };

    const handleResizeEnd = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsResizing(null);
      resizeStartRef.current = null;

      // Сбрасываем флаг с небольшой задержкой
      setTimeout(() => {
        draggedRef.current = false;
      }, 100);
    };

    document.addEventListener("mousemove", handleResizeMove, { capture: true });
    document.addEventListener("mouseup", handleResizeEnd, { capture: true });
    document.addEventListener("mouseleave", handleResizeEnd, { capture: true });

    return () => {
      document.removeEventListener("mousemove", handleResizeMove, { capture: true });
      document.removeEventListener("mouseup", handleResizeEnd, { capture: true });
      document.removeEventListener("mouseleave", handleResizeEnd, { capture: true });
    };
  }, [isResizing, element.id, onUpdate, previewScale]);

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: element.x * previewScale,
        top: element.y * previewScale,
      }}
      data-text-element
    >
      <div className="relative">
        {/* Левая ручка изменения размера */}
        {isSelected && !showDropdown && !showEdit && (
          <div
            className="absolute top-0 left-0 w-3 h-full cursor-ew-resize bg-blue-500 hover:bg-blue-600 z-20 rounded-l"
            style={{
              transform: "translateX(-100%)",
              opacity: isResizing === "left" ? 1 : 0.7,
            }}
            onMouseDown={(e) => handleResizeStart(e, "left")}
          />
        )}

        <div
          className={`cursor-move relative ${
            isSelected ? "ring-2 ring-blue-500 rounded" : ""
          }`}
          style={{
            fontSize: element.fontSize * previewScale,
            fontWeight: element.fontWeight || "bold",
            backgroundColor: element.backgroundColor
              ? `rgba(255, 255, 255, 0.6)`
              : "transparent",
            padding: element.boxPadding
              ? element.boxPadding * previewScale
              : undefined,
            borderRadius: "4px",
            whiteSpace: "pre-wrap",
            width: element.width ? element.width * previewScale : "auto",
            wordWrap: "break-word",
            overflowWrap: "break-word",
            lineHeight: "1.2",
            boxSizing: "border-box",
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onClick={handleClick}
        >
          {element.text}
        </div>

        {/* Правая ручка изменения размера */}
        {isSelected && !showDropdown && !showEdit && (
          <div
            className="absolute top-0 right-0 w-3 h-full cursor-ew-resize bg-blue-500 hover:bg-blue-600 z-20 rounded-r"
            style={{
              transform: "translateX(100%)",
              opacity: isResizing === "right" ? 1 : 0.7,
            }}
            onMouseDown={(e) => handleResizeStart(e, "right")}
          />
        )}
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          data-text-dropdown
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
          data-text-edit
          className="absolute top-full left-0 mt-2 bg-white border-2 border-blue-500 rounded-lg shadow-xl z-50 p-4 min-w-[280px] max-h-[500px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Edit Text</h3>
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
            {/* Text Input */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Text (переносы как в preview)
              </label>
              <textarea
                ref={textareaRef}
                value={element.text}
                onChange={(e) => onUpdate(element.id, { text: e.target.value })}
                className="border border-gray-300 rounded resize-none h-96"
                style={{
                  width: `${element.width || 400}px`,
                  fontSize: `${element.fontSize}px`,
                  fontWeight: element.fontWeight || "bold",
                  backgroundColor: element.backgroundColor
                    ? `rgba(255, 255, 255, 0.6)`
                    : "transparent",
                  padding: element.boxPadding
                    ? `${element.boxPadding}px`
                    : "10px",
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  overflowWrap: "break-word",
                  minHeight: "100px",
                  color: "#000",
                  lineHeight: "1.2",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Width Slider */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Width: {element.width || 400}px
              </label>
              <input
                type="range"
                min="100"
                max="720"
                value={element.width || 400}
                onChange={(e) =>
                  onUpdate(element.id, { width: parseInt(e.target.value) })
                }
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Font Size Slider */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Font Size: {element.fontSize}px
              </label>
              <input
                type="range"
                min="16"
                max="72"
                value={element.fontSize}
                onChange={(e) =>
                  onUpdate(element.id, { fontSize: parseInt(e.target.value) })
                }
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Font Weight Checkbox */}
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={element.fontWeight === "bold"}
                  onChange={(e) =>
                    onUpdate(element.id, {
                      fontWeight: e.target.checked ? "bold" : "normal",
                    })
                  }
                  className="w-4 h-4"
                  onClick={(e) => e.stopPropagation()}
                />
                Bold Font
              </label>
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
