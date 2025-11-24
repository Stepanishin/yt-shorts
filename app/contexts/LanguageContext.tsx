"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "ru";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header
    "header.title": "Shorts Generator",
    "header.subtitle": "Create engaging YouTube Shorts",
    "header.videoConstructor": "Video Constructor",
    "header.checking": "Checking...",
    "header.youtubeConnected": "YouTube connected",
    "header.connectYoutube": "Connect YouTube",

    // Landing Page
    "landing.hero.title": "Create Viral YouTube Shorts",
    "landing.hero.subtitle": "Automatically generate engaging short videos on any topic in seconds",
    "landing.hero.cta": "Get Started",
    "landing.hero.learnMore": "Learn More",

    "landing.features.title": "Why Choose Our Service?",
    "landing.features.automation.title": "Full Automation",
    "landing.features.automation.description": "From content creation to video generation - everything automated",
    "landing.features.quality.title": "High Quality",
    "landing.features.quality.description": "Professional voiceover and animated backgrounds",
    "landing.features.youtube.title": "YouTube Integration",
    "landing.features.youtube.description": "Direct upload to your YouTube channel",
    "landing.features.customization.title": "Full Customization",
    "landing.features.customization.description": "Adjust fonts, colors, backgrounds, and audio",

    "landing.howItWorks.title": "How It Works",
    "landing.howItWorks.step1.title": "Create Content",
    "landing.howItWorks.step1.description": "Add your text content or use our content sources",
    "landing.howItWorks.step2.title": "Generate Video",
    "landing.howItWorks.step2.description": "AI creates voiceover and animated background",
    "landing.howItWorks.step3.title": "Upload to YouTube",
    "landing.howItWorks.step3.description": "Publish directly to your channel with one click",

    "landing.cta.title": "Ready to Create Viral Content?",
    "landing.cta.subtitle": "Join thousands of creators already using our platform",
    "landing.cta.button": "Start Creating Now",

    "landing.footer.madeWith": "Made with",
    "landing.footer.by": "by",
  },
  ru: {
    // Header
    "header.title": "Генератор Шортсов",
    "header.subtitle": "Создавайте увлекательные YouTube Shorts",
    "header.videoConstructor": "Конструктор видео",
    "header.checking": "Проверка...",
    "header.youtubeConnected": "YouTube подключен",
    "header.connectYoutube": "Подключить YouTube",

    // Landing Page
    "landing.hero.title": "Создавайте Вирусные YouTube Shorts",
    "landing.hero.subtitle": "Автоматически генерируйте увлекательные короткие видео на любую тему за секунды",
    "landing.hero.cta": "Начать",
    "landing.hero.learnMore": "Узнать больше",

    "landing.features.title": "Почему выбирают нас?",
    "landing.features.automation.title": "Полная автоматизация",
    "landing.features.automation.description": "От создания контента до генерации видео - всё автоматизировано",
    "landing.features.quality.title": "Высокое качество",
    "landing.features.quality.description": "Профессиональная озвучка и анимированные фоны",
    "landing.features.youtube.title": "Интеграция с YouTube",
    "landing.features.youtube.description": "Прямая загрузка на ваш YouTube канал",
    "landing.features.customization.title": "Полная кастомизация",
    "landing.features.customization.description": "Настройте шрифты, цвета, фоны и аудио",

    "landing.howItWorks.title": "Как это работает",
    "landing.howItWorks.step1.title": "Создайте контент",
    "landing.howItWorks.step1.description": "Добавьте свой текст или используйте наши источники контента",
    "landing.howItWorks.step2.title": "Генерация видео",
    "landing.howItWorks.step2.description": "ИИ создаёт озвучку и анимированный фон",
    "landing.howItWorks.step3.title": "Загрузка на YouTube",
    "landing.howItWorks.step3.description": "Публикация напрямую на ваш канал в один клик",

    "landing.cta.title": "Готовы создавать вирусный контент?",
    "landing.cta.subtitle": "Присоединяйтесь к тысячам создателей, уже использующих нашу платформу",
    "landing.cta.button": "Начать создавать",

    "landing.footer.madeWith": "Сделано с",
    "landing.footer.by": "командой",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = localStorage.getItem("language") as Language | null;
      if (savedLanguage && (savedLanguage === "en" || savedLanguage === "ru")) {
        return savedLanguage;
      }
    }
    return "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("language", lang);
    }
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
