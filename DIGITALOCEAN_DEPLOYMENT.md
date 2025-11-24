# 🚀 Деплой на DigitalOcean App Platform

Подробная инструкция по развертыванию shorts-generator на DigitalOcean App Platform.

---

## 📋 Предварительные требования

1. **Аккаунт DigitalOcean** - [Зарегистрироваться](https://cloud.digitalocean.com/registrations/new)
2. **GitHub репозиторий** с вашим проектом
3. **MongoDB Atlas** (или другая база данных) - уже настроено
4. **DigitalOcean Spaces** для хранения видео файлов

---

## 🗂️ Шаг 1: Создание DigitalOcean Space

Space - это S3-совместимое хранилище для файлов (видео).

1. Откройте [DigitalOcean Spaces](https://cloud.digitalocean.com/spaces)
2. Нажмите **"Create a Space"**
3. Выберите:
   - **Region**: NYC3 (или ближайший к вам)
   - **Space Name**: `shorts-videos` (или любое другое имя)
   - **Enable CDN**: ✅ Включить (для быстрой доставки видео)
   - **Restrict File Listing**: ✅ Включить (безопасность)
4. Нажмите **"Create Space"**

### Получите Access Keys для Spaces:

1. Откройте [API Tokens](https://cloud.digitalocean.com/account/api/spaces)
2. Нажмите **"Generate New Key"**
3. Задайте имя: `shorts-generator-spaces`
4. **Сохраните:**
   - `Access Key` → будет `SPACES_ACCESS_KEY_ID`
   - `Secret Key` → будет `SPACES_SECRET_ACCESS_KEY`

⚠️ **ВАЖНО**: Secret Key показывается только один раз! Сохраните его сразу.

---

## 🏗️ Шаг 2: Создание приложения в App Platform

1. Откройте [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Нажмите **"Create App"**
3. Выберите **GitHub** в качестве источника
4. Авторизуйтесь в GitHub и выберите репозиторий `shorts-generator`
5. Выберите ветку: `main` (или вашу основную ветку)
6. **Автоопределение**:
   - DigitalOcean автоматически определит Next.js проект
   - Build Command: `npm run build`
   - Run Command: `npm start`

---

## ⚙️ Шаг 3: Настройка Environment Variables

В разделе **"Environment Variables"** добавьте все переменные из `.env.example`:

### 🔐 Обязательные переменные:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# PiAPI (генерация видео/аудио)
PIAPI_X_API_KEY=your_piapi_key

# NextAuth
NEXTAUTH_URL=https://your-app-name.ondigitalocean.app
NEXTAUTH_SECRET=your_nextauth_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# YouTube API
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=https://your-app-name.ondigitalocean.app/api/youtube/callback

# Encryption
ENCRYPTION_KEY=your_encryption_key

# Stripe
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# DigitalOcean Spaces (ВАЖНО!)
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_BUCKET=shorts-videos
SPACES_ACCESS_KEY_ID=your_spaces_access_key
SPACES_SECRET_ACCESS_KEY=your_spaces_secret_key
SPACES_REGION=us-east-1

# App URL
NEXT_PUBLIC_APP_URL=https://your-app-name.ondigitalocean.app

# Node Environment
NODE_ENV=production
```

### 📝 Как сгенерировать секретные ключи:

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY
openssl rand -base64 32
```

---

## 🛠️ Шаг 4: Настройка плана (Plan)

DigitalOcean предлагает несколько планов:

### Рекомендуемый план для вашего проекта:

**Professional - Basic ($12/мес)**
- 512 MB RAM
- 1 vCPU
- ✅ Достаточно для рендеринга видео
- ✅ Нет таймаутов на HTTP запросы

**Или Professional - Pro ($24/мес)** если много пользователей:
- 1 GB RAM
- 2 vCPU
- Быстрее рендеринг

⚠️ **Важно**: Basic план ($5/мес) **НЕ подойдет** - мало RAM для FFmpeg.

---

## 📦 Шаг 5: Установка FFmpeg (Buildpack)

DigitalOcean App Platform не включает FFmpeg по умолчанию. Нужно добавить buildpack:

### Вариант 1: Через `.buildpacks` файл (рекомендуется)

Создайте файл `.buildpacks` в корне проекта:

```
https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git
https://github.com/heroku/heroku-buildpack-nodejs.git
```

### Вариант 2: Через настройки App Platform

1. В настройках приложения найдите **"Build Phase"**
2. Добавьте **Custom Buildpack**:
   - URL: `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`

---

## 🚀 Шаг 6: Деплой

1. Нажмите **"Next"** → **"Review"**
2. Проверьте все настройки
3. Нажмите **"Create Resources"**

DigitalOcean начнет сборку и деплой вашего приложения.

⏱️ Первый деплой занимает **5-10 минут**.

---

## ✅ Шаг 7: Проверка работы

После деплоя:

1. Откройте ваше приложение: `https://your-app-name.ondigitalocean.app`
2. Проверьте:
   - ✅ Авторизация через Google работает
   - ✅ Генерация AI видео/аудио работает
   - ✅ Рендеринг видео работает
   - ✅ Видео загружаются в DigitalOcean Spaces

### Проверка FFmpeg:

В логах приложения (Console) вы должны увидеть:
```
FFmpeg command: ...
Rendering progress: 10 %
Rendering progress: 50 %
📤 Uploading video to DigitalOcean Spaces...
✅ Video uploaded to Spaces
```

---

## 🔧 Настройка автодеплоя

DigitalOcean автоматически деплоит при каждом push в GitHub:

1. В настройках App Platform включите **"Autodeploy"**
2. Теперь каждый `git push` → автоматический деплой

---

## 🌐 Настройка кастомного домена (опционально)

Если хотите использовать свой домен вместо `.ondigitalocean.app`:

1. В настройках App Platform → **"Settings"** → **"Domains"**
2. Нажмите **"Add Domain"**
3. Введите ваш домен: `yourdomain.com`
4. Добавьте DNS записи (A/CNAME) у вашего регистратора доменов
5. DigitalOcean автоматически выпустит SSL сертификат (Let's Encrypt)

---

## 📊 Мониторинг и логи

### Просмотр логов:

1. Откройте ваше приложение в App Platform
2. Перейдите в **"Runtime Logs"**
3. Здесь вы увидите все логи приложения в реальном времени

### Метрики:

- **CPU Usage** - использование процессора
- **Memory Usage** - использование RAM
- **Bandwidth** - трафик

---

## 💰 Стоимость

Примерная стоимость:

| Сервис | План | Цена |
|--------|------|------|
| App Platform | Professional Basic (512MB) | $12/мес |
| Spaces | 250 GB storage + CDN | $5/мес |
| Spaces Bandwidth | $0.01/GB | ~$1-5/мес |
| **Итого** | | **~$18-22/мес** |

---

## 🐛 Troubleshooting

### Проблема: "FFmpeg not found"

**Решение**: Убедитесь что добавили buildpack для FFmpeg (см. Шаг 5)

### Проблема: "Out of memory" при рендеринге

**Решение**: Увеличьте план до Professional Pro (1GB RAM)

### Проблема: Видео не загружается в Spaces

**Решение**:
1. Проверьте правильность всех `SPACES_*` переменных
2. Проверьте что Space создан и публично доступен
3. Проверьте логи на наличие ошибок загрузки

### Проблема: OAuth redirect не работает

**Решение**:
1. Обновите `YOUTUBE_REDIRECT_URI` на production URL
2. Обновите Authorized redirect URIs в Google Cloud Console
3. Добавьте production URL в NextAuth: `NEXTAUTH_URL`

---

## 🔄 Обновление приложения

Для обновления приложения:

```bash
# Локально
git add .
git commit -m "Update feature"
git push origin main

# DigitalOcean автоматически задеплоит изменения
```

---

## 📞 Поддержка

- [DigitalOcean Documentation](https://docs.digitalocean.com/products/app-platform/)
- [DigitalOcean Community](https://www.digitalocean.com/community)
- [GitHub Issues](https://github.com/your-repo/issues)

---

## ✨ Готово!

Ваше приложение теперь работает на DigitalOcean App Platform с:
- ✅ Автоматическим деплоем из GitHub
- ✅ FFmpeg для рендеринга видео
- ✅ DigitalOcean Spaces для хранения видео
- ✅ Без таймаутов для AI генерации
- ✅ SSL сертификатом
- ✅ Автомасштабированием (опционально)
