"use client";

import { useState, useRef, useEffect } from "react";
import GenerationLogsModal from "./GenerationLogsModal";
import EmojiElement from "./VideoConstructor/EmojiElement";
import TextElement from "./VideoConstructor/TextElement";
import SubscribeElement from "./VideoConstructor/SubscribeElement";
import AddElementsPanel from "./VideoConstructor/AddElementsPanel";
import BackgroundSettings from "./VideoConstructor/BackgroundSettings";

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

interface SubscribeElement {
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
  const [subscribeElements, setSubscribeElements] = useState<SubscribeElement[]>([]);
  const [emojiElements, setEmojiElements] = useState<EmojiElement[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");
  const [backgroundType, setBackgroundType] = useState<"video" | "image">("video");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number>(10);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string>("");
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedSubscribeId, setSelectedSubscribeId] = useState<string | null>(null);
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

  // Состояния для модального окна с логами
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsModalTitle, setLogsModalTitle] = useState("");
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [generationError, setGenerationError] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const hasLoadedFromStorage = useRef(false);

  // Вспомогательная функция для добавления логов
  const addLog = (message: string) => {
    setGenerationLogs((prev) => [...prev, message]);
  };

  // Сброс состояния модального окна
  const resetLogsModal = () => {
    setGenerationLogs([]);
    setGenerationComplete(false);
    setGenerationError(false);
  };

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
        setSubscribeElements(state.subscribeElements || []);
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
      subscribeElements,
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
    subscribeElements,
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
        setSubscribeElements([]);
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
      fontWeight: "bold",
    };
    setTextElements([...textElements, newElement]);
    setSelectedTextId(newElement.id);
  };

  // Добавить новый subscribe элемент
  const addSubscribeElement = () => {
    const newElement: SubscribeElement = {
      id: Math.random().toString(36).substr(2, 9),
      text: "SUBSCRIBE",
      x: Math.max(SAFE_PADDING, VIDEO_WIDTH / 2 - 100),
      y: Math.max(SAFE_PADDING, VIDEO_HEIGHT - 300),
      fontSize: 40,
      color: "white@1",
      backgroundColor: "red@0.8",
      boxPadding: 15,
      fontWeight: "bold",
      language: "en",
    };
    setSubscribeElements([...subscribeElements, newElement]);
    setSelectedSubscribeId(newElement.id);
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
    type: "text" | "subscribe" | "emoji"
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
    } else if (type === "subscribe") {
      setSubscribeElements((prev) =>
        prev.map((el) =>
          el.id === id ? { ...el, isDragging: true } : el
        )
      );
      setSelectedSubscribeId(id);
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

    setSubscribeElements((prev) =>
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
    setSubscribeElements((prev) =>
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

  // Обновить subscribe элемент
  const updateSubscribeElement = (id: string, updates: Partial<SubscribeElement>) => {
    setSubscribeElements((prev) =>
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

  const deleteSubscribeElement = (id: string) => {
    setSubscribeElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedSubscribeId === id) setSelectedSubscribeId(null);
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

    // Открываем модальное окно и сбрасываем логи
    resetLogsModal();
    setLogsModalTitle("Создание видео");
    setShowLogsModal(true);
    setIsRendering(true);
    setRenderedVideoUrl("");

    try {
      addLog("🎬 Начинаем создание видео...");
      addLog(`⏱️ Длительность: ${videoDuration} секунд`);
      addLog(`📹 Фон: ${backgroundType === "video" ? "видео" : "изображение"}`);
      addLog(`📝 Текстовых элементов: ${textElements.length}`);
      addLog(`🔔 Subscribe элементов: ${subscribeElements.length}`);
      addLog(`😀 Эмодзи элементов: ${emojiElements.length}`);
      if (audioUrl) {
        addLog("🎵 Аудио: добавлено");
      }
      addLog("🔄 Отправка на рендеринг...");

      // Объединяем текстовые и subscribe элементы в один массив для рендеринга
      const allTextElements = [
        ...textElements.map((el) => ({
          text: el.text,
          x: el.x,
          y: el.y,
          fontSize: el.fontSize,
          color: el.color,
          backgroundColor: el.backgroundColor,
          boxPadding: el.boxPadding,
          fontWeight: el.fontWeight || "bold",
        })),
        ...subscribeElements.map((el) => ({
          text: el.text,
          x: el.x,
          y: el.y,
          fontSize: el.fontSize,
          color: "white@1",
          backgroundColor: "red@0.9",
          boxPadding: el.boxPadding || 15,
          fontWeight: "bold",
        })),
      ];

      const response = await fetch("/api/videos/constructor/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backgroundVideoUrl: backgroundType === "video" ? backgroundUrl : undefined,
          backgroundImageUrl: backgroundType === "image" ? backgroundUrl : undefined,
          textElements: allTextElements,
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
        addLog("✅ Видео успешно создано!");
        addLog(`📹 URL видео: ${data.video.videoUrl.substring(0, 50)}...`);

        setRenderedVideoUrl(data.video.videoUrl);
        setGenerationComplete(true);

        // Автозакрытие через 3 секунды
        setTimeout(() => {
          setShowLogsModal(false);
        }, 3000);
      } else {
        addLog(`❌ Ошибка: ${data.error}`);
        setGenerationError(true);
      }
    } catch (error) {
      console.error("Render error:", error);
      addLog(`❌ Произошла ошибка: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
      setGenerationError(true);
    } finally {
      setIsRendering(false);
      setGenerationComplete(true);
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

    // Открываем модальное окно и сбрасываем логи
    resetLogsModal();
    setLogsModalTitle("Генерация видео-фона");
    setShowLogsModal(true);
    setGeneratingBackground(true);

    try {
      addLog("🎬 Начинаем генерацию видео-фона...");
      addLog(`💰 Стоимость: ${requiredCredits} кредитов (€${(requiredCredits / 100).toFixed(2)})`);
      addLog(`🎨 Модель: ${backgroundModel}`);

      // Используем пользовательский промпт или собираем весь текст для контекста
      const hasCustomPrompt = backgroundPrompt.trim().length > 0;
      const promptText = hasCustomPrompt
        ? backgroundPrompt.trim()
        : textElements.map(el => el.text).join(" ") || "Beautiful background video";

      addLog(`📝 Промпт: "${promptText.substring(0, 100)}${promptText.length > 100 ? '...' : ''}"`);
      addLog("🔄 Отправка запроса на сервер...");

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
        addLog("✅ Фон успешно сгенерирован!");
        addLog(`📹 URL видео: ${data.videoUrl.substring(0, 50)}...`);
        addLog("💳 Кредиты успешно списаны");

        setBackgroundUrl(data.videoUrl);
        setBackgroundType("video");
        setGenerationComplete(true);

        // Автозакрытие через 3 секунды
        setTimeout(() => {
          setShowLogsModal(false);
        }, 3000);
      } else {
        // Проверяем на ошибку недостатка кредитов
        if (response.status === 402) {
          addLog(`❌ Недостаточно кредитов!`);
          addLog(`💰 Требуется: ${data.requiredCredits} кредитов`);
          addLog(`💰 Доступно: ${data.currentCredits} кредитов`);
          addLog("⚠️ Пожалуйста, пополните баланс");
        } else {
          addLog(`❌ Ошибка: ${data.error}`);
        }
        setGenerationError(true);
      }
    } catch (error) {
      console.error("Generate background error:", error);
      addLog(`❌ Произошла ошибка: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
      setGenerationError(true);
    } finally {
      setGeneratingBackground(false);
      setGenerationComplete(true);
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

    // Открываем модальное окно и сбрасываем логи
    resetLogsModal();
    setLogsModalTitle("Генерация аудио");
    setShowLogsModal(true);
    setGeneratingAudio(true);

    try {
      addLog("🎵 Начинаем генерацию аудио...");
      addLog(`💰 Стоимость: ${requiredCredits} кредитов (€${(requiredCredits / 100).toFixed(2)})`);
      addLog(`🎨 Модель: ${audioModel} (Udio)`);

      // Используем пользовательский промпт или собираем весь текст для контекста
      const promptText = audioPrompt.trim() || textElements.map(el => el.text).join(" ") || "Upbeat cheerful background music";

      addLog(`📝 Промпт: "${promptText.substring(0, 100)}${promptText.length > 100 ? '...' : ''}"`);
      addLog("🔄 Отправка запроса на сервер...");

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
        addLog("✅ Аудио успешно сгенерировано!");
        addLog(`🎵 URL аудио: ${data.audioUrl.substring(0, 50)}...`);
        if (data.duration) {
          addLog(`⏱️ Длительность: ${data.duration} секунд`);
        }
        addLog("💳 Кредиты успешно списаны");

        setAudioUrl(data.audioUrl);
        setGenerationComplete(true);

        // Автозакрытие через 3 секунды
        setTimeout(() => {
          setShowLogsModal(false);
        }, 3000);
      } else {
        // Проверяем на ошибку недостатка кредитов
        if (response.status === 402) {
          addLog(`❌ Недостаточно кредитов!`);
          addLog(`💰 Требуется: ${data.requiredCredits} кредитов`);
          addLog(`💰 Доступно: ${data.currentCredits} кредитов`);
          addLog("⚠️ Пожалуйста, пополните баланс");
        } else {
          addLog(`❌ Ошибка: ${data.error}`);
        }
        setGenerationError(true);
      }
    } catch (error) {
      console.error("Generate audio error:", error);
      addLog(`❌ Произошла ошибка: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
      setGenerationError(true);
    } finally {
      setGeneratingAudio(false);
      setGenerationComplete(true);
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

  return (
    <div className="space-y-4">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Панель управления */}
        <div className="lg:col-span-1 space-y-6">
        {/* Фон и настройки */}
        <BackgroundSettings
          videoDuration={videoDuration}
          backgroundType={backgroundType}
          backgroundUrl={backgroundUrl}
          backgroundModel={backgroundModel}
          backgroundPrompt={backgroundPrompt}
          audioUrl={audioUrl}
          audioModel={audioModel}
          audioPrompt={audioPrompt}
          generatingBackground={generatingBackground}
          generatingAudio={generatingAudio}
          onVideoDurationChange={setVideoDuration}
          onBackgroundTypeChange={setBackgroundType}
          onBackgroundUrlChange={setBackgroundUrl}
          onBackgroundModelChange={setBackgroundModel}
          onBackgroundPromptChange={setBackgroundPrompt}
          onAudioUrlChange={setAudioUrl}
          onAudioModelChange={setAudioModel}
          onAudioPromptChange={setAudioPrompt}
          onGenerateBackground={handleGenerateBackground}
          onGenerateAudio={handleGenerateAudio}
        />

        {/* Добавить элементы */}
        <AddElementsPanel
          onAddText={addTextElement}
          onAddSubscribe={addSubscribeElement}
          onAddEmoji={() => addEmojiElement("😂")}
          onClearAll={() => {
            setTextElements([]);
            setSubscribeElements([]);
            setEmojiElements([]);
            setBackgroundUrl("");
            setAudioUrl("");
            setRenderedVideoUrl("");
            setVideoTitle("");
            setVideoDescription("");
            setSelectedTextId(null);
            setSelectedSubscribeId(null);
            setSelectedEmojiId(null);
            localStorage.removeItem("videoConstructorState");
          }}
        />

      </div>

      {/* Область предпросмотра */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3 text-gray-900">Предпросмотр</h2>
          <div className="flex justify-center">
            <div
              ref={canvasRef}
              className="relative bg-black"
              style={{
                width: VIDEO_WIDTH * PREVIEW_SCALE,
                height: VIDEO_HEIGHT * PREVIEW_SCALE,
                overflow: "visible",
              }}
            >
              {/* Clipped background and safe zone area */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
                  className="absolute border-2 border-dashed border-yellow-400 opacity-50"
                  style={{
                    left: SAFE_PADDING * PREVIEW_SCALE,
                    top: SAFE_PADDING * PREVIEW_SCALE,
                    right: SAFE_PADDING * PREVIEW_SCALE,
                    bottom: SAFE_PADDING * PREVIEW_SCALE,
                  }}
                />
              </div>

              {/* Текстовые элементы */}
              {textElements.map((el) => (
                <TextElement
                  key={el.id}
                  element={el}
                  previewScale={PREVIEW_SCALE}
                  isSelected={selectedTextId === el.id}
                  onDragStart={(e, id) => handleDragStart(e, id, "text")}
                  onSelect={setSelectedTextId}
                  onUpdate={updateTextElement}
                  onDelete={deleteTextElement}
                />
              ))}

              {/* Subscribe элементы */}
              {subscribeElements.map((el) => (
                <SubscribeElement
                  key={el.id}
                  element={el}
                  previewScale={PREVIEW_SCALE}
                  isSelected={selectedSubscribeId === el.id}
                  onDragStart={(e, id) => handleDragStart(e, id, "subscribe")}
                  onSelect={setSelectedSubscribeId}
                  onUpdate={updateSubscribeElement}
                  onDelete={deleteSubscribeElement}
                />
              ))}

              {/* Эмодзи элементы */}
              {emojiElements.map((el) => (
                <EmojiElement
                  key={el.id}
                  element={el}
                  previewScale={PREVIEW_SCALE}
                  isSelected={selectedEmojiId === el.id}
                  onDragStart={(e, id) => handleDragStart(e, id, "emoji")}
                  onSelect={setSelectedEmojiId}
                  onUpdate={updateEmojiElement}
                  onDelete={deleteEmojiElement}
                />
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
            <h2 className="text-lg font-semibold mb-3 text-gray-900">Готовое видео</h2>

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
                <label className="block text-sm font-medium mb-1 text-gray-900">
                  Название видео (опционально)
                </label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Оставьте пустым для генерации AI"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900">
                  Описание (опционально)
                </label>
                <textarea
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  placeholder="Оставьте пустым для генерации AI"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
                  rows={2}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
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

      {/* Модальное окно с логами генерации */}
      <GenerationLogsModal
        isOpen={showLogsModal}
        title={logsModalTitle}
        logs={generationLogs}
        isComplete={generationComplete}
        hasError={generationError}
      />
    </div>
  );
}
