# 🚀 Пошаговое руководство по настройке

## Краткий обзор стека

- **Frontend/Backend**: Next.js на Vercel
- **База данных**: MongoDB Atlas (бесплатный tier)
- **Хранилище**: Cloudflare R2 (дешевое, без egress fees)
- **Рендеринг видео**: Remotion Lambda (AWS)
- **AI**: OpenAI API (GPT для текста, DALL-E для фонов)
- **Музыка**: YouTube Audio Library (бесплатно)

---

## 📋 Шаг 1: Базовая инфраструктура

### 1.1 MongoDB Atlas (5 минут)

1. Перейти на [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Создать бесплатный аккаунт
3. Создать кластер (выбрать FREE tier - M0)
4. В разделе Security:
   - Database Access: создать пользователя (username/password)
   - Network Access: добавить `0.0.0.0/0` (доступ отовсюду)
5. Получить connection string:
   - Кнопка "Connect" → "Connect your application"
   - Скопировать строку типа: `mongodb+srv://username:password@cluster.mongodb.net/`
6. Сохранить в `.env`: `MONGODB_URI=...`

### 1.2 OpenAI API (3 минуты)

1. Перейти на [platform.openai.com](https://platform.openai.com)
2. Зарегистрироваться / войти
3. Перейти в API Keys
4. Создать новый ключ
5. Сохранить в `.env`: `OPENAI_API_KEY=sk-...`

**💰 Стоимость**:
- GPT-4o-mini: ~$0.15 за 1M токенов (дешево)
- DALL-E 3: ~$0.04 за изображение
- ~10-20 видео = ~$1-2/день

---

## 📦 Шаг 2: Cloudflare R2 (10 минут)

### Почему R2?
- Дешевле AWS S3
- Без платы за скачивание (egress)
- 10 GB бесплатно каждый месяц

### Настройка:

1. Перейти на [cloudflare.com](https://www.cloudflare.com)
2. Зарегистрироваться
3. В дашборде: R2 → Create bucket
   - Имя: `shorts-videos`
4. Создать API токен:
   - R2 → Manage R2 API Tokens → Create API Token
   - Permissions: Read & Write
   - Сохранить:
     - `Access Key ID`
     - `Secret Access Key`
     - `Account ID`
5. Добавить в `.env`:
```
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=shorts-videos
```

---

## 🎬 Шаг 3: Remotion Lambda (15-20 минут)

### Что это?
Remotion Lambda - сервис для рендеринга видео в AWS. Обходит ограничения Vercel.

### Настройка AWS:

1. Создать [AWS аккаунт](https://aws.amazon.com)
2. Создать IAM пользователя:
   - IAM → Users → Add user
   - Имя: `remotion-lambda`
   - Access type: Programmatic access
   - Permissions: `AdministratorAccess` (для упрощения)
   - Сохранить Access Key ID и Secret Access Key

3. Установить Remotion CLI локально:
```bash
npm install -g @remotion/cli
```

4. Настроить Remotion Lambda:
```bash
npx remotion lambda sites create
npx remotion lambda functions deploy
```

5. Добавить в `.env`:
```
REMOTION_AWS_ACCESS_KEY_ID=...
REMOTION_AWS_SECRET_ACCESS_KEY=...
REMOTION_AWS_REGION=us-east-1
```

**💰 Стоимость**:
- AWS Lambda: первый 1M запросов бесплатно
- ~$0.01-0.05 за видео (очень дешево)
- 10-20 видео/день = ~$0.20-1.00/день

**Альтернатива (проще, но дороже)**:
- Использовать [Remotion Cloud](https://remotion.dev/cloud)
- $0.10-0.20 за видео
- Не нужно настраивать AWS

---

## 🎵 Шаг 4: Музыкальная библиотека (30 минут)

### Источник: YouTube Audio Library

1. Перейти на [YouTube Audio Library](https://studio.youtube.com/channel/UC.../music)
2. Нужен YouTube канал (создать если нет)
3. Выбрать треки:
   - Жанр: Happy, Bright, Funny, Upbeat
   - Mood: Happy, Energetic
   - Скачать 50-100 треков
4. Загрузить в Cloudflare R2:
   - Создать папку `music/` в бакете
   - Загрузить все треки

**Альтернативные источники** (роялти-фри):
- [Pixabay Music](https://pixabay.com/music/)
- [Free Music Archive](https://freemusicarchive.org/)
- [Bensound](https://www.bensound.com/)

---

## 📺 Шаг 5: YouTube API (15 минут)

### 5.1 Создать YouTube канал

1. Перейти на [youtube.com](https://youtube.com)
2. Создать канал (если нет)
3. Заполнить информацию о канале

### 5.2 Настроить Google Cloud Project

1. Перейти на [console.cloud.google.com](https://console.cloud.google.com)
2. Создать новый проект: "Shorts Generator"
3. Включить YouTube Data API v3:
   - APIs & Services → Enable APIs and Services
   - Найти "YouTube Data API v3" → Enable
4. Создать OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Web application
   - Authorized redirect URIs: 
     - `http://localhost:3000/api/youtube/callback` (для разработки)
     - `https://your-app.vercel.app/api/youtube/callback` (для продакшна)
5. Скачать JSON с credentials
6. Добавить в `.env`:
```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
```

### 5.3 Получить Refresh Token

После первого деплоя:
1. Открыть `/api/youtube/auth`
2. Авторизоваться
3. Скопировать refresh token
4. Добавить в `.env`: `YOUTUBE_REFRESH_TOKEN=...`

---

## 🔐 Шаг 6: Настроить авторизацию

1. Придумать пароль для входа
2. Захешировать его:
```bash
npx bcrypt-cli hash "your-password" 10
```
3. Добавить в `.env`:
```
AUTH_PASSWORD_HASH=$2a$10$...
JWT_SECRET=your-random-secret-string-at-least-32-chars
```

---

## 🚀 Шаг 7: Деплой на Vercel (5 минут)

### 7.1 Подготовка

1. Убедиться что все в `.env` заполнено
2. Создать `.env.example` (без значений)
3. Добавить в `.gitignore`:
```
.env
.env.local
node_modules/
.next/
```

### 7.2 Деплой

1. Установить Vercel CLI:
```bash
npm install -g vercel
```

2. Залогиниться:
```bash
vercel login
```

3. Деплой:
```bash
vercel
```

4. Добавить environment variables в Vercel:
   - Vercel Dashboard → Settings → Environment Variables
   - Добавить все из `.env`

5. Редеплой:
```bash
vercel --prod
```

---

## 📝 Итоговый .env файл

```bash
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/shorts-generator

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Cloudflare R2
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=shorts-videos

# Remotion Lambda
REMOTION_AWS_ACCESS_KEY_ID=...
REMOTION_AWS_SECRET_ACCESS_KEY=...
REMOTION_AWS_REGION=us-east-1

# YouTube
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...

# Auth
AUTH_PASSWORD_HASH=$2a$10$...
JWT_SECRET=your-random-secret-at-least-32-chars

# Music
MUSIC_SERVICE=youtube_library

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## 💰 Итоговая стоимость (примерно)

### Ежемесячно (10-20 видео/день):

| Сервис | Стоимость |
|--------|-----------|
| MongoDB Atlas | **$0** (Free tier) |
| Vercel | **$0-20** (Free → Pro если нужно) |
| Cloudflare R2 | **$0-5** (10GB бесплатно) |
| OpenAI API | **$30-60** (основная статья расходов) |
| Remotion Lambda (AWS) | **$6-30** |
| YouTube Audio Library | **$0** (бесплатно) |
| **ИТОГО** | **~$36-115/месяц** |

### Оптимизация затрат:

1. **OpenAI**: использовать GPT-4o-mini вместо GPT-4 (в 10 раз дешевле)
2. **Фоны**: использовать готовые изображения вместо DALL-E
3. **Remotion**: батчить генерацию (генерировать сразу 5-10 видео)

---

## ✅ Чек-лист готовности

- [ ] MongoDB Atlas настроен и connection string получен
- [ ] OpenAI API ключ получен
- [ ] Cloudflare R2 создан и ключи получены
- [ ] Remotion Lambda настроен (или Remotion Cloud)
- [ ] 50+ музыкальных треков загружены в R2
- [ ] YouTube канал создан
- [ ] YouTube API настроен
- [ ] OAuth credentials получены
- [ ] Пароль для входа захеширован
- [ ] Все переменные в `.env` заполнены
- [ ] Vercel проект создан
- [ ] Environment variables добавлены в Vercel

---

## 🎯 Следующие шаги

После настройки всей инфраструктуры:

1. **Разработка**: начать кодить приложение
2. **Тестирование**: сгенерировать первое видео
3. **Оптимизация**: настроить стиль и параметры
4. **Запуск**: начать генерацию контента

---

## 🆘 Troubleshooting

### Проблема: MongoDB не подключается
- Проверить Network Access (должен быть 0.0.0.0/0)
- Проверить username/password в connection string

### Проблема: Remotion Lambda не работает
- Проверить AWS credentials
- Убедиться что регион правильный (us-east-1)
- Проверить лимиты AWS аккаунта

### Проблема: Vercel timeout
- Это нормально - используем Remotion Lambda
- Проверить что Lambda запускается правильно

### Проблема: R2 не отдает файлы
- Настроить CORS в R2 бакете
- Проверить Public Access (если нужно)

---

**Готово! Теперь можно начинать разработку! 🚀**

