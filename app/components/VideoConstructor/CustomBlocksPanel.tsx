"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface CustomTextBlock {
  _id: string;
  name?: string;
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

interface CustomBlocksPanelProps {
  onAddBlock: (block: Omit<CustomTextBlock, "_id">) => void;
}

export default function CustomBlocksPanel({ onAddBlock }: CustomBlocksPanelProps) {
  const { data: session } = useSession();
  const [blocks, setBlocks] = useState<CustomTextBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      loadBlocks();
    }
  }, [session]);

  const loadBlocks = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/custom-blocks");
      if (response.ok) {
        const data = await response.json();
        setBlocks(data.blocks || []);
      }
    } catch (error) {
      console.error("Error loading custom blocks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Удалить этот блок из кастомных блоков?")) {
      return;
    }

    try {
      setDeletingId(blockId);
      const response = await fetch(`/api/custom-blocks?id=${blockId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setBlocks((prev) => prev.filter((b) => b._id !== blockId));
      } else {
        alert("Ошибка при удалении блока");
      }
    } catch (error) {
      console.error("Error deleting block:", error);
      alert("Ошибка при удалении блока");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddBlock = (block: CustomTextBlock) => {
    const { _id, ...blockData } = block;
    onAddBlock(blockData);
  };

  if (!session?.user?.id) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Мои блоки</h2>
        <div className="text-sm text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Мои блоки</h2>
        <div className="text-sm text-gray-500">
          У вас пока нет сохраненных блоков. Создайте текстовый блок и нажмите "Сохранить" в его настройках.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-3 text-gray-900">Мои блоки</h2>
      <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
        {blocks.map((block) => (
          <div
            key={block._id}
            className="border border-gray-200 rounded-lg p-2 hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer relative group"
            onClick={() => handleAddBlock(block)}
          >
            <div className="text-xs font-medium text-gray-700 mb-1 truncate">
              {block.name || block.text.substring(0, 20) + (block.text.length > 20 ? "..." : "")}
            </div>
            <div
              className="text-xs text-gray-600 truncate"
              style={{
                fontSize: `${Math.min(block.fontSize * 0.3, 10)}px`,
                fontWeight: block.fontWeight || "bold",
                color: block.color.includes("@") ? block.color.split("@")[0] : block.color,
              }}
            >
              {block.text.substring(0, 30)}
              {block.text.length > 30 ? "..." : ""}
            </div>
            <button
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 text-xs p-1"
              onClick={(e) => handleDelete(block._id, e)}
              disabled={deletingId === block._id}
              title="Удалить из кастомных блоков"
            >
              {deletingId === block._id ? "..." : "×"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

