"use client";

import { useState, useRef, useEffect } from "react";

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  boxPadding?: number;
  isDragging?: boolean;
}

interface EmojiElement {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  animation: "none" | "pulse" | "rotate" | "bounce" | "fade";
  isDragging?: boolean;
}

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 1280;
const PREVIEW_SCALE = 0.3; // 30% от оригинального размера для предпросмотра
const SAFE_PADDING = 15; // Безопасный отступ от краев видео в пикселях

interface VideoConstructorProps {
  jokeId?: string;
}

export default function VideoConstructor({ jokeId }: VideoConstructorProps) {
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [emojiElements, setEmojiElements] = useState<EmojiElement[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");
  const [backgroundType, setBackgroundType] = useState<"video" | "image">("video");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number>(10);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string>("");
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedEmojiId, setSelectedEmojiId] = useState<string | null>(null);
  const [uploadingToYouTube, setUploadingToYouTube] = useState(false);
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState<string | null>(null);
  const [useAITitle, setUseAITitle] = useState(true);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [generatingBackground, setGeneratingBackground] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Загрузить анекдот если передан jokeId
  useEffect(() => {
    if (!jokeId) return;

    const loadJoke = async () => {
      try {
        const response = await fetch(`/api/jokes/${jokeId}`);
        if (!response.ok) {
          alert("Не удалось загрузить анекдот");
          return;
        }

        const data = await response.json();
        const joke = data.joke;

        // Создаем текстовый элемент с текстом анекдота
        const jokeText = joke.editedText || joke.text;
        const newTextElement: TextElement = {
          id: Math.random().toString(36).substr(2, 9),
          text: jokeText,
          x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2 - 250),
          y: Math.max(SAFE_PADDING, VIDEO_HEIGHT / 2 - 100),
          fontSize: 32,
          color: "black@1",
          backgroundColor: "white@0.6",
          boxPadding: 15,
        };

        setTextElements([newTextElement]);

        // Добавляем смеющийся эмодзи
        const laughingEmojis = ["😂", "🤣", "😆", "😄"];
        const randomEmoji = laughingEmojis[Math.floor(Math.random() * laughingEmojis.length)];
        const newEmojiElement: EmojiElement = {
          id: Math.random().toString(36).substr(2, 9),
          emoji: randomEmoji,
          x: Math.max(SAFE_PADDING, Math.min(VIDEO_WIDTH - SAFE_PADDING, VIDEO_WIDTH / 2 + 150)),
          y: Math.max(SAFE_PADDING, Math.min(VIDEO_HEIGHT - SAFE_PADDING, VIDEO_HEIGHT / 2 + 150)),
          size: 80,
          animation: "bounce",
        };

        setEmojiElements([newEmojiElement]);

        // Устанавливаем название для YouTube
        if (joke.title) {
          setVideoTitle(joke.title);
        }
      } catch (error) {
        console.error("Failed to load joke:", error);
        alert("Произошла ошибка при загрузке анекдота");
      }
    };

    loadJoke();
  }, [jokeId]);

  // Добавить новый текстовый элемент
  const addTextElement = () => {
    const newElement: TextElement = {
      id: Math.random().toString(36).substr(2, 9),
      text: "Новый текст",
      x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2 - 100),
      y: Math.max(SAFE_PADDING, VIDEO_HEIGHT / 2),
      fontSize: 32,
      color: "black@1",
      backgroundColor: "white@0.6",
      boxPadding: 10,
    };
    setTextElements([...textElements, newElement]);
    setSelectedTextId(newElement.id);
  };

  // Добавить новый эмодзи
  const addEmojiElement = (emoji: string = "😂") => {
    const newElement: EmojiElement = {
      id: Math.random().toString(36).substr(2, 9),
      emoji,
      x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2),
      y: Math.max(SAFE_PADDING, VIDEO_HEIGHT / 2),
      size: 80,
      animation: "bounce",
    };
    setEmojiElements([...emojiElements, newElement]);
    setSelectedEmojiId(newElement.id);
  };

  // Обработка начала перетаскивания
  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    id: string,
    type: "text" | "emoji"
  ) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    dragStartPos.current = { x: clientX, y: clientY };

    if (type === "text") {
      setTextElements((prev) =>
        prev.map((el) =>
          el.id === id ? { ...el, isDragging: true } : el
        )
      );
      setSelectedTextId(id);
    } else {
      setEmojiElements((prev) =>
        prev.map((el) =>
          el.id === id ? { ...el, isDragging: true } : el
        )
      );
      setSelectedEmojiId(id);
    }
  };

  // Обработка перетаскивания
  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStartPos.current) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const deltaX = (clientX - dragStartPos.current.x) / PREVIEW_SCALE;
    const deltaY = (clientY - dragStartPos.current.y) / PREVIEW_SCALE;

    dragStartPos.current = { x: clientX, y: clientY };

    // Обновляем позицию перетаскиваемого элемента с учетом safe padding
    setTextElements((prev) =>
      prev.map((el) =>
        el.isDragging
          ? {
              ...el,
              x: Math.max(SAFE_PADDING, Math.min(VIDEO_WIDTH - SAFE_PADDING, el.x + deltaX)),
              y: Math.max(SAFE_PADDING, Math.min(VIDEO_HEIGHT - SAFE_PADDING, el.y + deltaY)),
            }
          : el
      )
    );

    setEmojiElements((prev) =>
      prev.map((el) =>
        el.isDragging
          ? {
              ...el,
              x: Math.max(SAFE_PADDING, Math.min(VIDEO_WIDTH - SAFE_PADDING, el.x + deltaX)),
              y: Math.max(SAFE_PADDING, Math.min(VIDEO_HEIGHT - SAFE_PADDING, el.y + deltaY)),
            }
          : el
      )
    );
  };

  // Обработка окончания перетаскивания
  const handleDragEnd = () => {
    dragStartPos.current = null;
    setTextElements((prev) =>
      prev.map((el) => ({ ...el, isDragging: false }))
    );
    setEmojiElements((prev) =>
      prev.map((el) => ({ ...el, isDragging: false }))
    );
  };

  // Обновить текстовый элемент
  const updateTextElement = (id: string, updates: Partial<TextElement>) => {
    setTextElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
    );
  };

  // Обновить эмодзи элемент
  const updateEmojiElement = (id: string, updates: Partial<EmojiElement>) => {
    setEmojiElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
    );
  };

  // Удалить элемент
  const deleteTextElement = (id: string) => {
    setTextElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  const deleteEmojiElement = (id: string) => {
    setEmojiElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedEmojiId === id) setSelectedEmojiId(null);
  };

  // Рендерить видео
  const handleRender = async () => {
    if (!backgroundUrl) {
      alert("Пожалуйста, добавьте фон");
      return;
    }

    setIsRendering(true);
    setRenderedVideoUrl("");

    try {
      const response = await fetch("/api/videos/constructor/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backgroundVideoUrl: backgroundType === "video" ? backgroundUrl : undefined,
          backgroundImageUrl: backgroundType === "image" ? backgroundUrl : undefined,
          textElements: textElements.map((el) => ({
            text: el.text,
            x: el.x,
            y: el.y,
            fontSize: el.fontSize,
            color: el.color,
            backgroundColor: el.backgroundColor,
            boxPadding: el.boxPadding,
          })),
          emojiElements: emojiElements.map((el) => ({
            emoji: el.emoji,
            x: el.x,
            y: el.y,
            size: el.size,
            animation: el.animation,
          })),
          audioUrl: audioUrl || undefined,
          duration: videoDuration,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRenderedVideoUrl(data.video.videoUrl);
        alert("Видео успешно создано!");
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (error) {
      console.error("Render error:", error);
      alert("Произошла ошибка при создании видео");
    } finally {
      setIsRendering(false);
    }
  };

  // Генерация фона через AI
  const handleGenerateBackground = async () => {
    setGeneratingBackground(true);
    try {
      // Собираем весь текст для контекста
      const allText = textElements.map(el => el.text).join(" ");

      const response = await fetch("/api/videos/constructor/generate-background", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: allText || "Beautiful background video",
          style: "nature", // Можно добавить выбор стиля позже
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBackgroundUrl(data.videoUrl);
        setBackgroundType("video");
        alert("Фон успешно сгенерирован!");
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (error) {
      console.error("Generate background error:", error);
      alert("Произошла ошибка при генерации фона");
    } finally {
      setGeneratingBackground(false);
    }
  };

  // Генерация аудио через AI
  const handleGenerateAudio = async () => {
    setGeneratingAudio(true);
    try {
      // Собираем весь текст для контекста
      const allText = textElements.map(el => el.text).join(" ");

      const response = await fetch("/api/videos/constructor/generate-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: allText || "Upbeat cheerful background music",
          lyricsType: "instrumental",
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAudioUrl(data.audioUrl);
        alert("Аудио успешно сгенерировано!");
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (error) {
      console.error("Generate audio error:", error);
      alert("Произошла ошибка при генерации аудио");
    } finally {
      setGeneratingAudio(false);
    }
  };

  // Публикация на YouTube
  const handleUploadToYouTube = async () => {
    if (!renderedVideoUrl) {
      alert("Сначала создайте видео");
      return;
    }

    setUploadingToYouTube(true);
    try {
      // Объединяем весь текст из элементов
      const allText = textElements.map(el => el.text).join("\n\n");
      let title: string;
      let description: string;

      // Используем AI для генерации названия и описания, если включено
      if (useAITitle && allText) {
        try {
          const aiResponse = await fetch("/api/youtube/generate-title", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jokeText: allText,
              jokeTitle: videoTitle || undefined,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            title = aiData.title;
            description = aiData.description;
          } else {
            throw new Error("AI generation failed");
          }
        } catch (aiError) {
          console.warn("AI title generation failed, using custom title:", aiError);
          // Fallback к пользовательскому названию
          title = videoTitle || "Video from Constructor";
          description = videoDescription || allText;
        }
      } else {
        // Используем пользовательское название
        title = videoTitle || "Video from Constructor";
        description = videoDescription || allText;
      }

      // Теги
      const tags = [
        "shorts",
        "video",
        "content",
        "creator",
      ];

      const response = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl: renderedVideoUrl,
          title,
          description,
          tags,
          privacyStatus: "public",
          jokeId: "constructor-" + Date.now(), // Уникальный ID для конструктора
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Если ошибка авторизации
        if (response.status === 401) {
          const shouldAuth = confirm(
            "Необходима авторизация YouTube. Открыть страницу авторизации?"
          );
          if (shouldAuth) {
            window.open("/api/youtube/auth", "_blank");
          }
          throw new Error("Необходима авторизация YouTube");
        }

        throw new Error(errorData.error || "Не удалось загрузить видео на YouTube");
      }

      const result = await response.json();
      setYoutubeVideoUrl(result.videoUrl);
      alert(`Видео успешно загружено на YouTube!\n${result.videoUrl}`);
    } catch (error) {
      console.error("Upload to YouTube error:", error);
      alert(`Ошибка публикации: ${error instanceof Error ? error.message : "Произошла ошибка"}`);
    } finally {
      setUploadingToYouTube(false);
    }
  };

  // Добавляем глобальные обработчики для перетаскивания
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e as unknown as React.MouseEvent);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e as unknown as React.TouchEvent);
    const handleTouchEnd = () => handleDragEnd();

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const selectedText = textElements.find((el) => el.id === selectedTextId);
  const selectedEmoji = emojiElements.find((el) => el.id === selectedEmojiId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Панель управления */}
      <div className="lg:col-span-1 space-y-6">
        {/* Фон */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Фон и настройки</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Длительность видео</label>
              <select
                value={videoDuration}
                onChange={(e) => setVideoDuration(parseInt(e.target.value))}
                className="w-full border rounded px-3 py-2"
              >
                <option value={5}>5 секунд</option>
                <option value={10}>10 секунд</option>
                <option value={15}>15 секунд</option>
                <option value={20}>20 секунд</option>
                <option value={30}>30 секунд</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Тип фона</label>
              <select
                value={backgroundType}
                onChange={(e) => setBackgroundType(e.target.value as "video" | "image")}
                className="w-full border rounded px-3 py-2"
              >
                <option value="video">Видео</option>
                <option value="image">Изображение</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">URL фона</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backgroundUrl}
                  onChange={(e) => setBackgroundUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={handleGenerateBackground}
                  disabled={generatingBackground}
                  className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 text-sm whitespace-nowrap"
                  title="Генерировать через AI"
                >
                  {generatingBackground ? "⏳" : "🤖 AI"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">URL аудио (опционально)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={handleGenerateAudio}
                  disabled={generatingAudio}
                  className="px-3 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-400 text-sm whitespace-nowrap"
                  title="Генерировать через AI"
                >
                  {generatingAudio ? "⏳" : "🎵 AI"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                MP3 или другой аудио формат
              </p>
            </div>
          </div>
        </div>

        {/* Добавить элементы */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Добавить элементы</h2>
          <div className="space-y-2">
            <button
              onClick={addTextElement}
              className="w-full bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
            >
              + Добавить текст
            </button>
            <div className="grid grid-cols-4 gap-2">
              {["😂", "❤️", "🔥", "👍", "🎉", "⭐", "💯", "✨"].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addEmojiElement(emoji)}
                  className="text-2xl border rounded py-2 hover:bg-gray-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Редактирование выбранного текста */}
        {selectedText && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Редактировать текст</h2>
              <button
                onClick={() => deleteTextElement(selectedText.id)}
                className="text-red-500 hover:text-red-700"
              >
                Удалить
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Текст</label>
                <textarea
                  value={selectedText.text}
                  onChange={(e) =>
                    updateTextElement(selectedText.id, { text: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Размер шрифта: {selectedText.fontSize}
                </label>
                <input
                  type="range"
                  min="16"
                  max="72"
                  value={selectedText.fontSize}
                  onChange={(e) =>
                    updateTextElement(selectedText.id, {
                      fontSize: parseInt(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  X: {selectedText.x.toFixed(0)} Y: {selectedText.y.toFixed(0)}
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Редактирование выбранного эмодзи */}
        {selectedEmoji && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Редактировать эмодзи</h2>
              <button
                onClick={() => deleteEmojiElement(selectedEmoji.id)}
                className="text-red-500 hover:text-red-700"
              >
                Удалить
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Эмодзи</label>
                <input
                  type="text"
                  value={selectedEmoji.emoji}
                  onChange={(e) =>
                    updateEmojiElement(selectedEmoji.id, { emoji: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 text-2xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Размер: {selectedEmoji.size}
                </label>
                <input
                  type="range"
                  min="40"
                  max="200"
                  value={selectedEmoji.size}
                  onChange={(e) =>
                    updateEmojiElement(selectedEmoji.id, {
                      size: parseInt(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Анимация</label>
                <select
                  value={selectedEmoji.animation}
                  onChange={(e) =>
                    updateEmojiElement(selectedEmoji.id, {
                      animation: e.target.value as EmojiElement["animation"],
                    })
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="none">Без анимации</option>
                  <option value="pulse">Пульсация</option>
                  <option value="rotate">Вращение</option>
                  <option value="bounce">Подпрыгивание</option>
                  <option value="fade">Появление</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  X: {selectedEmoji.x.toFixed(0)} Y: {selectedEmoji.y.toFixed(0)}
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Кнопка рендеринга */}
        <div className="bg-white rounded-lg shadow p-4">
          <button
            onClick={handleRender}
            disabled={isRendering}
            className="w-full bg-green-500 text-white rounded px-4 py-3 font-semibold hover:bg-green-600 disabled:bg-gray-400"
          >
            {isRendering ? "Создание видео..." : "Создать видео"}
          </button>
        </div>
      </div>

      {/* Область предпросмотра */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Предпросмотр</h2>
          <div className="flex justify-center">
            <div
              ref={canvasRef}
              className="relative bg-black"
              style={{
                width: VIDEO_WIDTH * PREVIEW_SCALE,
                height: VIDEO_HEIGHT * PREVIEW_SCALE,
                overflow: "hidden",
              }}
            >
              {/* Фон */}
              {backgroundUrl && (
                <>
                  {backgroundType === "video" ? (
                    <video
                      src={backgroundUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                    />
                  ) : (
                    <img
                      src={backgroundUrl}
                      alt="Background"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </>
              )}

              {/* Safe Zone границы */}
              <div
                className="absolute pointer-events-none border-2 border-dashed border-yellow-400 opacity-50"
                style={{
                  left: SAFE_PADDING * PREVIEW_SCALE,
                  top: SAFE_PADDING * PREVIEW_SCALE,
                  right: SAFE_PADDING * PREVIEW_SCALE,
                  bottom: SAFE_PADDING * PREVIEW_SCALE,
                }}
              />

              {/* Текстовые элементы */}
              {textElements.map((el) => (
                <div
                  key={el.id}
                  className={`absolute cursor-move ${
                    selectedTextId === el.id ? "ring-2 ring-blue-500" : ""
                  }`}
                  style={{
                    left: el.x * PREVIEW_SCALE,
                    top: el.y * PREVIEW_SCALE,
                    fontSize: el.fontSize * PREVIEW_SCALE,
                    backgroundColor: el.backgroundColor
                      ? `rgba(255, 255, 255, 0.6)`
                      : "transparent",
                    padding: el.boxPadding
                      ? el.boxPadding * PREVIEW_SCALE
                      : undefined,
                    borderRadius: "4px",
                    whiteSpace: "pre-wrap",
                  }}
                  onMouseDown={(e) => handleDragStart(e, el.id, "text")}
                  onTouchStart={(e) => handleDragStart(e, el.id, "text")}
                >
                  {el.text}
                </div>
              ))}

              {/* Эмодзи элементы */}
              {emojiElements.map((el) => (
                <div
                  key={el.id}
                  className={`absolute cursor-move ${
                    selectedEmojiId === el.id ? "ring-2 ring-green-500" : ""
                  }`}
                  style={{
                    left: el.x * PREVIEW_SCALE,
                    top: el.y * PREVIEW_SCALE,
                    fontSize: el.size * PREVIEW_SCALE,
                    lineHeight: 1,
                  }}
                  onMouseDown={(e) => handleDragStart(e, el.id, "emoji")}
                  onTouchStart={(e) => handleDragStart(e, el.id, "emoji")}
                >
                  {el.emoji}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Готовое видео */}
        {renderedVideoUrl && (
          <div className="bg-white rounded-lg shadow p-4 mt-6">
            <h2 className="text-lg font-semibold mb-3">Готовое видео</h2>

            {/* Настройки публикации */}
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Название видео (опционально)
                </label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Оставьте пустым для генерации AI"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Описание (опционально)
                </label>
                <textarea
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  placeholder="Оставьте пустым для генерации AI"
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAITitle}
                  onChange={(e) => setUseAITitle(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span>🤖 Использовать AI для генерации названия и описания</span>
              </label>
            </div>

            {/* Кнопки действий */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleUploadToYouTube}
                disabled={uploadingToYouTube}
                className="flex-1 bg-red-600 text-white rounded px-4 py-2 hover:bg-red-700 font-medium disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {uploadingToYouTube ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Загрузка...
                  </>
                ) : youtubeVideoUrl ? (
                  "✅ Опубликовано"
                ) : (
                  "📤 Опубликовать на YouTube"
                )}
              </button>
              <a
                href={renderedVideoUrl}
                download
                className="flex-1 text-center bg-green-500 text-white rounded px-4 py-2 hover:bg-green-600 font-medium"
              >
                ⬇ Скачать видео
              </a>
            </div>

            {/* Ссылка на YouTube */}
            {youtubeVideoUrl && (
              <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <div className="font-medium mb-1 text-green-800 text-sm">
                  ✅ Видео опубликовано на YouTube!
                </div>
                <a
                  href={youtubeVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 underline"
                >
                  Открыть на YouTube →
                </a>
              </div>
            )}

            <video
              src={renderedVideoUrl}
              controls
              className="w-full rounded"
            />
          </div>
        )}
      </div>
    </div>
  );
}
