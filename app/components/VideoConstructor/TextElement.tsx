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
  const [isEditingText, setIsEditingText] = useState(false);
  const [isResizing, setIsResizing] = useState<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; x: number; mouseX: number } | null>(null);

  const parseColor = (value?: string) => {
    // Supports formats: "#rrggbb@0.6", "black@1", "#rrggbb", "black"
    const presets: Record<string, string> = {
      black: "#000000",
      white: "#ffffff",
      red: "#ff0000",
      green: "#00ff00",
      blue: "#0000ff",
    };

    const raw = value || "#000000@1";
    const [colorPart, alphaPart] = raw.split("@");
    const hex = presets[colorPart] || colorPart || "#000000";
    const alpha = alphaPart !== undefined ? Math.max(0, Math.min(1, Number(alphaPart))) : 1;

    const toCssRgba = () => {
      const c = hex.replace("#", "");
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    return { hex, alpha, css: toCssRgba() };
  };

  const textColor = parseColor(element.color);
  const boxColor = parseColor(element.backgroundColor || "#ffffff@0.6");

  const palette = [
    "#000000",
    "#ffffff",
    "#ff0000",
    "#ff7f00",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#8b00ff",
    "#ff1493",
    "#00bcd4",
    "#795548",
  ];

  const ColorPicker = ({
    label,
    color,
    onChange,
  }: {
    label: string;
    color: { hex: string; alpha: number };
    onChange: (hex: string, alpha: number) => void;
  }) => {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span>{label}</span>
          <span className="text-gray-500">{Math.round(color.alpha * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={color.alpha}
          onChange={(e) => onChange(color.hex, parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="grid grid-cols-6 gap-1">
          {palette.map((hex) => (
            <button
              key={`${label}-${hex}`}
              type="button"
              className={`h-7 rounded border ${hex.toLowerCase() === color.hex.toLowerCase() ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'}`}
              style={{ backgroundColor: hex, pointerEvents: "auto" }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(hex, color.alpha);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(hex, color.alpha);
              }}
              aria-label={`${label} ${hex}`}
            />
          ))}
        </div>
      </div>
    );
  };

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
        setIsEditingText(false);
      }
    };

    if (showDropdown || isEditingText) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showDropdown, isEditingText]);

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
    if (isEditingText) return; // Не начинаем drag во время редактирования
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    mouseDownPosRef.current = { x: clientX, y: clientY };
    draggedRef.current = false;
    onDragStart(e, element.id);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!draggedRef.current) {
      setShowDropdown((prev) => !prev);
      onSelect(element.id);
    }

    // Сбрасываем флаг
    draggedRef.current = false;
    mouseDownPosRef.current = null;
  };

  const handleEnterEdit = () => {
    setIsEditingText(true);
    setShowDropdown(true);
    onSelect(element.id);
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

  const handleTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    const value = e.currentTarget.innerText;
    onUpdate(element.id, { text: value });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsEditingText(false);
      containerRef.current?.focus();
    }
  };

  const handleColorChange = (type: "text" | "background", hex: string, alpha: number) => {
    const value = `${hex}@${alpha}`;
    if (type === "text") {
      onUpdate(element.id, { color: value });
    } else {
      onUpdate(element.id, { backgroundColor: value });
    }
  };

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
        {isSelected && !isEditingText && (
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
          className={`cursor-${isEditingText ? "text" : "move"} relative ${
            isSelected ? "ring-2 ring-blue-500 rounded" : ""
          }`}
          style={{
            fontSize: element.fontSize * previewScale,
            fontWeight: element.fontWeight || "bold",
            color: textColor.css,
            backgroundColor: element.backgroundColor ? boxColor.css : "transparent",
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
          onDoubleClick={handleEnterEdit}
          contentEditable={isEditingText}
          suppressContentEditableWarning
          onInput={handleTextInput}
          onBlur={() => setIsEditingText(false)}
          onKeyDown={handleKeyDown}
        >
          {element.text}
        </div>

        {/* Правая ручка изменения размера */}
        {isSelected && !isEditingText && (
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

      {/* Dropdown panel */}
      {isSelected && showDropdown && (
        <div
          data-text-dropdown
          className="absolute top-full left-0 mt-2 bg-white border border-gray-200 shadow-lg rounded-lg p-3 z-50 w-[340px] space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-sm font-semibold text-gray-800">
            <span>Настройки текста</span>
            <button
              className="text-red-500 hover:text-red-600 text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              Удалить
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs text-gray-700">
            <ColorPicker
              label="Цвет текста"
              color={textColor}
              onChange={(hex, alpha) => handleColorChange("text", hex, alpha)}
            />
            <ColorPicker
              label="Фон текста"
              color={boxColor}
              onChange={(hex, alpha) => handleColorChange("background", hex, alpha)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-gray-700">
            <div>
              <label className="block mb-1">Ширина: {element.width || 400}px</label>
              <input
                type="range"
                min="100"
                max="720"
                value={element.width || 400}
                onChange={(e) =>
                  onUpdate(element.id, { width: parseInt(e.target.value) })
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block mb-1">Размер: {element.fontSize}px</label>
              <input
                type="range"
                min="16"
                max="72"
                value={element.fontSize}
                onChange={(e) =>
                  onUpdate(element.id, { fontSize: parseInt(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={element.fontWeight === "bold"}
                onChange={(e) =>
                  onUpdate(element.id, {
                    fontWeight: e.target.checked ? "bold" : "normal",
                  })
                }
                className="w-4 h-4"
              />
              Жирный
            </label>

            <div className="flex items-center gap-3">
              {/* <button
                className="text-blue-600 hover:text-blue-700 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEnterEdit();
                }}
              >
                Редактировать текст
              </button> */}
              <button
                className="text-gray-500 hover:text-gray-700 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown(false);
                }}
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 border-t pt-2 flex justify-between">
            <span>Перемещайте/тяните края для ширины</span>
            <span>
              X: {element.x.toFixed(0)} | Y: {element.y.toFixed(0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
