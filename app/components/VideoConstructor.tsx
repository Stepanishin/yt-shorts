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
  fontWeight?: "normal" | "bold";
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
  const [backgroundModel, setBackgroundModel] = useState<"ray-v1" | "hailuo-t2v-01" | "luma-direct">("luma-direct");
  const [audioModel, setAudioModel] = useState<"llm">("llm");
  const [backgroundPrompt, setBackgroundPrompt] = useState<string>("");
  const [audioPrompt, setAudioPrompt] = useState<string>("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const hasLoadedFromStorage = useRef(false);

  // Загрузить сохраненное состояние из localStorage при монтировании
  // НО только если НЕ передан jokeId (иначе загрузим анекдот из библиотеки)
  useEffect(() => {
    // Если передан jokeId - не загружаем из localStorage, ждем загрузки анекдота
    if (jokeId) {
      console.log("Skipping localStorage load - jokeId provided");
      setTimeout(() => {
        hasLoadedFromStorage.current = true;
      }, 100);
      return;
    }

    const savedState = localStorage.getItem("videoConstructorState");
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setTextElements(state.textElements || []);
        setEmojiElements(state.emojiElements || []);
        setBackgroundUrl(state.backgroundUrl || "");
        setBackgroundType(state.backgroundType || "video");
        setAudioUrl(state.audioUrl || "");
        setVideoDuration(state.videoDuration || 10);
        setVideoTitle(state.videoTitle || "");
        setVideoDescription(state.videoDescription || "");
        setUseAITitle(state.useAITitle ?? true);
        setBackgroundPrompt(state.backgroundPrompt || "");
        setAudioPrompt(state.audioPrompt || "");
        console.log("Loaded state from localStorage");
      } catch (error) {
        console.error("Failed to load saved state:", error);
      }
    }
    // После загрузки помечаем что данные загружены
    // Используем setTimeout чтобы дать React время обновить все state
    setTimeout(() => {
      hasLoadedFromStorage.current = true;
    }, 100);
  }, [jokeId]);

  // Сохранять состояние в localStorage при изменениях (но не при загрузке)
  useEffect(() => {
    // Пропускаем сохранение пока не загрузили данные
    if (!hasLoadedFromStorage.current) {
      return;
    }

    const state = {
      textElements,
      emojiElements,
      backgroundUrl,
      backgroundType,
      audioUrl,
      videoDuration,
      videoTitle,
      videoDescription,
      useAITitle,
      backgroundPrompt,
      audioPrompt,
    };

    console.log("Saving to localStorage:", state);
    localStorage.setItem("videoConstructorState", JSON.stringify(state));
  }, [
    textElements,
    emojiElements,
    backgroundUrl,
    backgroundType,
    audioUrl,
    videoDuration,
    videoTitle,
    videoDescription,
    useAITitle,
    backgroundPrompt,
    audioPrompt,
  ]);

  // Загрузить анекдот если передан jokeId
  useEffect(() => {
    if (!jokeId) return;

    const loadJoke = async () => {
      try {
        // ВСЕГДА очищаем localStorage и state когда заходим через jokeId
        console.log("Loading joke from library, clearing all state...");
        localStorage.removeItem("videoConstructorState");

        // Очищаем весь state перед загрузкой новой шутки
        setTextElements([]);
        setEmojiElements([]);
        setBackgroundUrl("");
        setBackgroundType("video");
        setAudioUrl("");
        setVideoDuration(10);
        setVideoTitle("");
        setVideoDescription("");
        setBackgroundPrompt("");
        setAudioPrompt("");
        setRenderedVideoUrl("");
        setYoutubeVideoUrl(null);

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

        console.log("Joke loaded successfully:", joke.title || jokeText.substring(0, 50));
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
            fontWeight: el.fontWeight || "normal",
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
    // Определяем стоимость на основе модели
    const modelCosts: Record<string, number> = {
      "ray-v1": 35, // Luma Dream Machine через PiAPI - $0.35
      "hailuo-t2v-01": 35, // Hailuo Text-to-Video - $0.35
      "luma-direct": 25, // Luma прямой API (Ray Flash 2) - $0.25
    };
    const requiredCredits = modelCosts[backgroundModel];
    const confirmMessage = `Генерация фона (${backgroundModel}) стоит ${requiredCredits} кредитов (€${(requiredCredits / 100).toFixed(2)}). Продолжить?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setGeneratingBackground(true);
    try {
      // Используем пользовательский промпт или собираем весь текст для контекста
      const hasCustomPrompt = backgroundPrompt.trim().length > 0;
      const promptText = hasCustomPrompt
        ? backgroundPrompt.trim()
        : textElements.map(el => el.text).join(" ") || "Beautiful background video";

      const response = await fetch("/api/videos/constructor/generate-background", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: promptText,
          style: "nature", // Можно добавить выбор стиля позже
          modelName: backgroundModel,
          useCustomPrompt: hasCustomPrompt, // Указываем что это кастомный промпт
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBackgroundUrl(data.videoUrl);
        setBackgroundType("video");
        alert("Фон успешно сгенерирован!");
      } else {
        // Проверяем на ошибку недостатка кредитов
        if (response.status === 402) {
          alert(`Недостаточно кредитов! Требуется ${data.requiredCredits} кредитов для генерации фона. Пожалуйста, пополните баланс.`);
        } else {
          alert(`Ошибка: ${data.error}`);
        }
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
    // Определяем стоимость на основе модели
    const modelCosts: Record<string, number> = {
      "llm": 10,
    };
    const requiredCredits = modelCosts[audioModel];
    const confirmMessage = `Генерация аудио (${audioModel}) стоит ${requiredCredits} кредитов (€${(requiredCredits / 100).toFixed(2)}). Продолжить?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setGeneratingAudio(true);
    try {
      // Используем пользовательский промпт или собираем весь текст для контекста
      const promptText = audioPrompt.trim() || textElements.map(el => el.text).join(" ") || "Upbeat cheerful background music";

      const response = await fetch("/api/videos/constructor/generate-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: promptText,
          lyricsType: "instrumental",
          modelName: audioModel,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAudioUrl(data.audioUrl);
        alert("Аудио успешно сгенерировано!");
      } else {
        // Проверяем на ошибку недостатка кредитов
        if (response.status === 402) {
          alert(`Недостаточно кредитов! Требуется ${data.requiredCredits} кредитов для генерации аудио. Пожалуйста, пополните баланс.`);
        } else {
          alert(`Ошибка: ${data.error}`);
        }
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
    <div className="space-y-4">

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
              <div className="flex gap-2 mb-2">
                <select
                  value={backgroundModel}
                  onChange={(e) => setBackgroundModel(e.target.value as "ray-v1" | "hailuo-t2v-01" | "luma-direct")}
                  className="border rounded px-3 py-2 text-sm"
                  title="Модель для генерации фона"
                >
                  <option value="luma-direct">⚡ Luma Flash (25 кредитов / $0.25) - БЫСТРО</option>
                  <option value="ray-v1">Luma Ray v1 (35 кредитов / $0.35)</option>
                  <option value="hailuo-t2v-01">Hailuo T2V-01 (35 кредитов / $0.35)</option>
                </select>
              </div>

              {/* Промпт для генерации фона */}
              <div className="mb-2">
                <textarea
                  value={backgroundPrompt}
                  onChange={(e) => setBackgroundPrompt(e.target.value)}
                  placeholder="Опционально: описание фона для AI (если пусто, используется текст из элементов)"
                  className="w-full border rounded px-3 py-2 text-sm resize-none"
                  rows={2}
                />
              </div>

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
              <div className="flex gap-2 mb-2">
                <select
                  value={audioModel}
                  onChange={(e) => setAudioModel(e.target.value as "llm")}
                  className="border rounded px-3 py-2 text-sm"
                  title="Модель для генерации аудио"
                >
                  <option value="llm">Udio (10 кредитов)</option>
                </select>
              </div>

              {/* Промпт для генерации аудио */}
              <div className="mb-2">
                <textarea
                  value={audioPrompt}
                  onChange={(e) => setAudioPrompt(e.target.value)}
                  placeholder="Опционально: описание музыки для AI (если пусто, используется текст из элементов)"
                  className="w-full border rounded px-3 py-2 text-sm resize-none"
                  rows={2}
                />
              </div>

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
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Добавить элементы</h2>
            <button
              onClick={() => {
                if (confirm("Очистить все элементы и начать заново?")) {
                  setTextElements([]);
                  setEmojiElements([]);
                  setBackgroundUrl("");
                  setAudioUrl("");
                  setRenderedVideoUrl("");
                  setVideoTitle("");
                  setVideoDescription("");
                  setSelectedTextId(null);
                  setSelectedEmojiId(null);
                  localStorage.removeItem("videoConstructorState");
                }
              }}
              className="text-xs text-red-600 hover:text-red-800 underline"
            >
              Очистить все
            </button>
          </div>
          <div className="space-y-2">
            <button
              onClick={addTextElement}
              className="w-full bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
            >
              + Добавить текст
            </button>

            {/* Основные эмодзи */}
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

            {/* Subscribe / Suscríbete эмодзи */}
            <div className="border-t pt-2 mt-2">
              <p className="text-xs text-gray-600 mb-1 font-medium">Subscribe Actions:</p>
              <div className="grid grid-cols-4 gap-2">
                {["👇", "☝️", "👉", "👈", "🔔", "▶️", "📺", "🎬"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addEmojiElement(emoji)}
                    className="text-2xl border rounded py-2 hover:bg-gray-100"
                    title="Subscribe action emoji"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Subscribe Text Buttons */}
            <div className="border-t pt-2 mt-2 space-y-1">
              <p className="text-xs text-gray-600 mb-1 font-medium">Quick Actions:</p>
              <button
                onClick={() => {
                  const newElement: TextElement = {
                    id: Math.random().toString(36).substr(2, 9),
                    text: "SUBSCRIBE",
                    x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2 - 100),
                    y: Math.max(SAFE_PADDING, VIDEO_HEIGHT - 300), // Поднято на 150px (было -150)
                    fontSize: 40,
                    color: "white@1",
                    backgroundColor: "red@0.8",
                    boxPadding: 15,
                    fontWeight: "bold",
                  };
                  setTextElements([...textElements, newElement]);
                  setSelectedTextId(newElement.id);

                  // Добавляем стрелку вниз как эмодзи отдельно
                  const arrowElement: EmojiElement = {
                    id: Math.random().toString(36).substr(2, 9),
                    emoji: "👇",
                    x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2),
                    y: Math.max(SAFE_PADDING, VIDEO_HEIGHT - 240), // Поднято на 150px (было -90)
                    size: 60,
                    animation: "bounce",
                  };
                  setEmojiElements([...emojiElements, arrowElement]);
                }}
                className="w-full bg-red-600 text-white rounded px-3 py-1.5 text-sm hover:bg-red-700 font-medium"
              >
                + SUBSCRIBE 👇
              </button>
              <button
                onClick={() => {
                  const newElement: TextElement = {
                    id: Math.random().toString(36).substr(2, 9),
                    text: "SUSCRIBETE",
                    x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2 - 100),
                    y: Math.max(SAFE_PADDING, VIDEO_HEIGHT - 300), // Поднято на 150px (было -150)
                    fontSize: 40,
                    color: "white@1",
                    backgroundColor: "red@0.8",
                    boxPadding: 15,
                    fontWeight: "bold",
                  };
                  setTextElements([...textElements, newElement]);
                  setSelectedTextId(newElement.id);

                  // Добавляем стрелку вниз как эмодзи отдельно
                  const arrowElement: EmojiElement = {
                    id: Math.random().toString(36).substr(2, 9),
                    emoji: "👇",
                    x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2),
                    y: Math.max(SAFE_PADDING, VIDEO_HEIGHT - 240), // Поднято на 150px (было -90)
                    size: 60,
                    animation: "bounce",
                  };
                  setEmojiElements([...emojiElements, arrowElement]);
                }}
                className="w-full bg-red-600 text-white rounded px-3 py-1.5 text-sm hover:bg-red-700 font-medium"
              >
                + SUSCRÍBETE 👇
              </button>
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
                  style={{ height: '500px' }}
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
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={selectedText.fontWeight === "bold"}
                    onChange={(e) =>
                      updateTextElement(selectedText.id, {
                        fontWeight: e.target.checked ? "bold" : "normal",
                      })
                    }
                    className="w-4 h-4"
                  />
                  Жирный шрифт
                </label>
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
                    fontWeight: el.fontWeight || "normal",
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

          {/* Кнопка рендеринга под preview */}
          <div className="mt-4">
            <button
              onClick={handleRender}
              disabled={isRendering}
              className="w-full bg-green-500 text-white rounded px-4 py-3 font-semibold hover:bg-green-600 disabled:bg-gray-400"
            >
              {isRendering ? "Создание видео..." : "Создать видео"}
            </button>
          </div>
        </div>

        {/* Готовое видео */}
        {renderedVideoUrl && (
          <div className="bg-white rounded-lg shadow p-4 mt-6">
            <h2 className="text-lg font-semibold mb-3">Готовое видео</h2>

            {/* Кнопки действий сверху */}
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

            {/* Видео по центру с размером как у preview */}
            <div className="flex justify-center mb-4">
              <div style={{ width: VIDEO_WIDTH * PREVIEW_SCALE }}>
                <video
                  src={renderedVideoUrl}
                  controls
                  className="w-full rounded bg-black"
                  style={{
                    maxHeight: VIDEO_HEIGHT * PREVIEW_SCALE,
                    objectFit: "contain"
                  }}
                />
              </div>
            </div>

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
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
