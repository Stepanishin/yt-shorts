# Plan: "La historia completa de..." — Long-form Video Auto-Generation

## Overview

Fully automated pipeline that generates 5-8 minute biographical videos about Spanish celebrities. Zero human involvement — from celebrity selection to YouTube upload.

**Frequency:** 2-3 videos per week
**Cost per video:** ~$0.20-0.30 (only GPT + OpenAI TTS)
**Format:** 1920x1080 landscape, 5-8 minutes, TTS narration + subtitles + photos + background music

---

## Pipeline Flow

```
CRON (2-3 раза в неделю, ночью)
  ↓
1. SELECTOR — Выбирает знаменитость автоматически
   - Берёт из YouTube Data API видео канала с 100K+ views
   - Извлекает имя знаменитости из заголовка
   - Проверяет что для неё ещё нет long-form видео (дедупликация)
   ↓
2. SCRIPT — GPT-5 генерирует сценарий
   - Вход: имя знаменитости
   - GPT сам ищет факты из своих знаний (без внешних API)
   - Выход: JSON с 8-12 сценами (текст нарации + поисковый запрос для фото)
   ↓
3. IMAGES — Бесплатный поиск фото
   - Источник 1: Скрапинг Hola.com по имени знаменитости (уже есть скрапер)
   - Источник 2: Скрапинг Google Images (бесплатно, без API)
   - Источник 3: Wikimedia Commons API (бесплатно)
   - Кэш в MongoDB чтобы не искать повторно
   ↓
4. TTS — OpenAI TTS озвучивает сценарий
   - Модель: tts-1-hd, голос: "onyx" (драматичный мужской)
   - Генерирует один MP3 файл на всю нарацию
   - Стоимость: ~$0.12 за 5-7 мин
   ↓
5. SUBTITLES — OpenAI Whisper генерирует таймкоды
   - Отправляет TTS аудио обратно в Whisper API
   - Получает word-level timestamps
   - Конвертирует в SRT формат
   - Стоимость: ~$0.04 за 7 мин
   ↓
6. RENDER — FFmpeg собирает финальное видео
   - Каждая сцена: фото + Ken Burns эффект (zoom/pan)
   - Длительность сцены = длительность нарации для этой сцены
   - Субтитры поверх видео (drawtext)
   - TTS нарация + фоновая музыка (из существующего пула, -15dB)
   - Переходы между сценами: crossfade 0.5 сек
   - Выход: MP4 1920x1080, H.264, AAC
   ↓
7. METADATA — GPT генерирует title + description + tags
   - Title: "La historia completa de [Nombre] — Lo que nadie te contó"
   - Description: SEO-оптимизированная, 1000+ chars, с таймкодами сцен
   - Tags: динамические (как для Shorts)
   ↓
8. UPLOAD — Загрузка на YouTube как обычное видео
   - Категория: 24 (Entertainment) — для long-form это правильно
   - Thumbnail: первый кадр с текстом overlay (генерируется через Canvas)
   - Используем существующий youtube-client.ts
```

---

## Стоимость за видео

| Компонент | Сервис | Цена |
|-----------|--------|------|
| Сценарий | GPT-5 (~8K tokens) | ~$0.08 |
| TTS озвучка | OpenAI tts-1-hd (~5000 chars) | ~$0.12 |
| Субтитры | OpenAI Whisper (7 min) | ~$0.04 |
| Поиск фото | Скрапинг (бесплатно) | $0.00 |
| Метаданные | GPT-5 (~3K tokens) | ~$0.03 |
| Хранение | DigitalOcean Spaces | ~$0.01 |
| **Итого за видео** | | **~$0.28** |
| **12 видео/месяц** | | **~$3.36/мес** |

---

## Инструменты (все бесплатные кроме GPT/OpenAI)

| Задача | Инструмент | Бесплатно? |
|--------|-----------|-----------|
| Сценарий | GPT-5 (OpenAI API) | Платный ✓ (готов платить) |
| TTS | OpenAI TTS API | Платный ✓ (готов платить) |
| Субтитры | OpenAI Whisper API | Платный ✓ (готов платить) |
| Поиск фото | Скрапинг Google Images / Hola.com / Wikimedia | Бесплатно ✓ |
| Рендеринг видео | FFmpeg (локально) | Бесплатно ✓ |
| Генерация thumbnail | node-canvas (уже в проекте) | Бесплатно ✓ |
| Хранение видео | DigitalOcean Spaces (уже оплачен) | Уже есть ✓ |
| Загрузка на YouTube | YouTube API (уже настроен) | Бесплатно ✓ |
| База данных | MongoDB Atlas (уже настроен) | Уже есть ✓ |

---

## Новые файлы

```
lib/longform/
├── longform-generator.ts       — Главный оркестратор (вызывает всё по порядку)
├── longform-selector.ts        — Автовыбор знаменитости из топ Shorts
├── script-generator.ts         — GPT-5: генерация сценария по сценам
├── tts-generator.ts            — OpenAI TTS: текст → аудио MP3
├── subtitle-generator.ts       — Whisper: аудио → таймкоды субтитров
├── image-sourcer.ts            — Поиск фото (скрапинг Google/Hola/Wikimedia)
├── video-renderer.ts           — FFmpeg: сборка длинного видео
├── thumbnail-generator.ts      — Canvas: генерация превью для YouTube
└── metadata-generator.ts       — GPT: title + description + tags

lib/db/
└── auto-generation-longform.ts — MongoDB: конфиг + очередь заданий

app/api/auto-generation-longform/
├── config/route.ts             — GET/POST конфигурации
├── generate-now/route.ts       — Ручной запуск генерации
└── queue/route.ts              — Просмотр очереди заданий
```

## Модифицируемые файлы

```
lib/auto-generation/scheduler.ts  — Добавить longform тип в расписание
lib/scheduler.ts                  — Зарегистрировать longform проверку
```

---

## Формат сценария (output GPT-5)

```json
{
  "celebrityName": "Isabel Pantoja",
  "videoTitle": "La historia completa de Isabel Pantoja — Lo que nadie te contó",
  "totalScenes": 10,
  "estimatedDuration": "6-7 minutos",
  "scenes": [
    {
      "sceneNumber": 1,
      "narrationText": "En el barrio sevillano de Triana, una niña de ojos oscuros cantaba en las calles sin saber que el destino le tenía preparado un viaje lleno de gloria y tragedia. Isabel Pantoja nació el dos de agosto de mil novecientos cincuenta y seis, en una familia humilde donde el arte flamenco corría por las venas.",
      "imageSearchQuery": "Isabel Pantoja joven Sevilla años 70",
      "mood": "nostalgic",
      "estimatedSeconds": 35
    },
    {
      "sceneNumber": 2,
      "narrationText": "A los dieciséis años ya pisaba los escenarios más importantes de Andalucía. Su voz rompía el silencio de los tablaos y los aplausos no tardaron en llegar...",
      "imageSearchQuery": "Isabel Pantoja cantando joven escenario",
      "mood": "triumphant",
      "estimatedSeconds": 30
    }
  ]
}
```

---

## Формат субтитров (output Whisper)

```json
[
  { "start": 0.0, "end": 3.2, "text": "En el barrio sevillano de Triana," },
  { "start": 3.2, "end": 6.8, "text": "una niña de ojos oscuros cantaba en las calles" },
  { "start": 6.8, "end": 10.1, "text": "sin saber que el destino le tenía preparado" }
]
```

---

## База данных

### Коллекция: `longform_configs`

```typescript
{
  userId: string;
  isEnabled: boolean;
  videosPerWeek: number;                // 2-3
  generateAt: { dayOfWeek: number; hour: number; minute: number }[];
  ttsVoice: "onyx" | "nova" | "alloy"; // default: "onyx"
  backgroundMusicUrls: string[];        // из существующего пула
  backgroundMusicVolume: number;        // 0.15 (15%)
  sceneCount: { min: number; max: number }; // { min: 8, max: 12 }
  minShortsViews: number;               // 100000
  youtube: {
    privacyStatus: "public" | "private" | "unlisted";
    tags: string[];
    savedChannelId?: string;
    categoryId: "24";                   // Entertainment
  };
}
```

### Коллекция: `longform_jobs`

```typescript
{
  userId: string;
  configId: string;
  status: "pending" | "processing" | "completed" | "failed";
  celebrityName: string;
  script?: Scene[];
  ttsAudioUrl?: string;
  subtitles?: Subtitle[];
  imageUrls?: string[];
  renderedVideoUrl?: string;
  thumbnailUrl?: string;
  youtubeVideoId?: string;
  errorMessage?: string;
  createdAt: Date;
}
```

### Коллекция: `celebrity_images_cache`

```typescript
{
  celebrityName: string;          // нормализованное lowercase
  images: { url: string; source: string; fetchedAt: Date }[];
  lastUpdatedAt: Date;
}
```

### Коллекция: `longform_celebrities_used`

```typescript
{
  celebrityName: string;
  videoId: string;                // YouTube video ID
  generatedAt: Date;
}
```

---

## Порядок реализации

### Фаза 1: TTS + Субтитры (день 1)
1. `tts-generator.ts` — OpenAI TTS API обёртка
2. `subtitle-generator.ts` — Whisper API → SRT таймкоды
3. Тест: сгенерировать аудио + субтитры для тестового текста

### Фаза 2: Сценарий (день 1)
4. `script-generator.ts` — GPT-5 генерация сцен
5. Тест: сгенерировать сценарий для Isabel Pantoja

### Фаза 3: Поиск фото (день 2)
6. `image-sourcer.ts` — скрапинг Google Images + Hola.com + Wikimedia
7. `celebrity_images_cache` коллекция в MongoDB
8. Тест: найти 10 фото для Isabel Pantoja

### Фаза 4: Рендеринг видео (день 2-3)
9. `video-renderer.ts` — FFmpeg pipeline:
   - Каждая сцена: изображение → Ken Burns (zoompan) на N секунд
   - Субтитры: drawtext с enable='between(t,start,end)'
   - Crossfade 0.5s между сценами
   - Микс: TTS audio (0dB) + background music (-15dB)
   - Output: 1920x1080, H.264, ~100-200MB
10. Тест: собрать полное видео из результатов фаз 1-3

### Фаза 5: Thumbnail (день 3)
11. `thumbnail-generator.ts` — Canvas:
    - Фото знаменитости (70% кадра)
    - Текст: "LA HISTORIA COMPLETA" (крупный, жёлтый)
    - Имя знаменитости (белый, bold)
    - Красная/жёлтая рамка

### Фаза 6: Оркестратор + Селектор (день 3)
12. `longform-selector.ts` — YouTube Data API → топ Shorts → извлечение имени
13. `metadata-generator.ts` — GPT: title + description + tags
14. `longform-generator.ts` — склеивает всё: selector → script → images → TTS → subtitles → render → thumbnail → upload

### Фаза 7: БД + API + Автоматизация (день 4)
15. `auto-generation-longform.ts` — MongoDB CRUD
16. API routes (config, generate-now, queue)
17. Интеграция в scheduler.ts — автозапуск по расписанию
18. Тест: полный цикл от выбора знаменитости до загрузки на YouTube

---

## Риски и решения

| Риск | Решение |
|------|---------|
| FFmpeg рендерит долго (10-20 мин) | Запускать ночью (3 AM), mutex на 1 видео одновременно |
| Мало фото для знаменитости | Разрешить повторное использование фото с разными Ken Burns эффектами |
| Google блокирует скрапинг | Fallback на Hola.com скрапер + Wikimedia API |
| GPT галлюцинирует факты | В промпте указать "только широко известные факты", добавить дисклеймер в описании |
| Whisper неточно транскрибирует | TTS аудио чистое → Whisper работает почти идеально на нём |
| YouTube дублирует контент канала | Генерировать только для знаменитостей без существующего long-form видео |
