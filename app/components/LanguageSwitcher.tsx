"use client";

import { useLanguage } from "../contexts/LanguageContext";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
          language === "en"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("ru")}
        className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
          language === "ru"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        RU
      </button>
    </div>
  );
}
