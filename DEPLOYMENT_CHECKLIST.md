# ✅ Чеклист деплоя на DigitalOcean

Краткий чеклист перед деплоем.

## 📋 Предварительная подготовка

- [ ] Создан аккаунт на DigitalOcean
- [ ] Репозиторий проекта на GitHub
- [ ] MongoDB Atlas настроен и работает

## 🗂️ 1. DigitalOcean Spaces

- [ ] Создан Space (например: `shorts-videos`)
- [ ] Включен CDN для Space
- [ ] Сгенерированы Access Keys для Spaces
- [ ] Сохранены:
  - `SPACES_ACCESS_KEY_ID`
  - `SPACES_SECRET_ACCESS_KEY`
  - `SPACES_ENDPOINT` (например: https://nyc3.digitaloceanspaces.com)
  - `SPACES_BUCKET` (имя вашего Space)

## 🏗️ 2. App Platform

- [ ] Создано приложение в App Platform
- [ ] Подключен GitHub репозиторий
- [ ] Выбрана ветка `main`
- [ ] Автоопределение Next.js работает

## ⚙️ 3. Environment Variables

Добавлены все переменные из `.env.example`:

### Обязательные:
- [ ] `MONGODB_URI`
- [ ] `OPENAI_API_KEY`
- [ ] `PIAPI_X_API_KEY`
- [ ] `NEXTAUTH_URL` (production URL)
- [ ] `NEXTAUTH_SECRET`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `YOUTUBE_CLIENT_ID`
- [ ] `YOUTUBE_CLIENT_SECRET`
- [ ] `YOUTUBE_REDIRECT_URI` (production URL)
- [ ] `ENCRYPTION_KEY`
- [ ] `STRIPE_PUBLISHABLE_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`

### DigitalOcean Spaces (КРИТИЧНО):
- [ ] `SPACES_ENDPOINT`
- [ ] `SPACES_BUCKET`
- [ ] `SPACES_ACCESS_KEY_ID`
- [ ] `SPACES_SECRET_ACCESS_KEY`
- [ ] `SPACES_REGION`

### Дополнительные:
- [ ] `NEXT_PUBLIC_APP_URL` (production URL)
- [ ] `NODE_ENV=production`

## 🛠️ 4. План (Pricing)

- [ ] Выбран план: **Professional Basic** (минимум)
  - 512 MB RAM
  - 1 vCPU
  - $12/мес

## 📦 5. FFmpeg Setup

- [ ] Добавлен файл `.buildpacks` в репозиторий
- [ ] Buildpack для FFmpeg в списке первым

## 🔧 6. Google Cloud Console

Обновите OAuth настройки для production:

- [ ] Добавлен production URL в Authorized JavaScript origins:
  - `https://your-app-name.ondigitalocean.app`
- [ ] Добавлен redirect URI в Authorized redirect URIs:
  - `https://your-app-name.ondigitalocean.app/api/youtube/callback`
  - `https://your-app-name.ondigitalocean.app/api/auth/callback/google`

## 💳 7. Stripe Webhook

- [ ] Обновлен Stripe webhook endpoint на production URL:
  - `https://your-app-name.ondigitalocean.app/api/stripe/webhook`
- [ ] Получен новый `STRIPE_WEBHOOK_SECRET` для production

## 🚀 8. Деплой

- [ ] Нажата кнопка "Create Resources"
- [ ] Дождаться завершения сборки (5-10 минут)
- [ ] Проверить логи на наличие ошибок

## ✅ 9. Проверка после деплоя

- [ ] Открывается главная страница
- [ ] Авторизация через Google работает
- [ ] Генерация AI видео работает (проверить логи)
- [ ] Генерация AI аудио работает
- [ ] Рендеринг видео работает
- [ ] Видео загружается в Spaces (проверить в Space)
- [ ] Видео доступно по публичному URL из Spaces
- [ ] Загрузка на YouTube работает
- [ ] Stripe платежи работают

## 🔄 10. Автодеплой

- [ ] Включен Autodeploy в настройках App Platform
- [ ] Проверен автодеплой: сделать commit → push → проверить деплой

## 📊 11. Мониторинг

- [ ] Проверены Runtime Logs - нет критичных ошибок
- [ ] Проверены метрики: CPU, Memory, Bandwidth
- [ ] Настроены email уведомления о проблемах (опционально)

---

## ⚠️ Типичные проблемы

### FFmpeg not found
✅ Решение: Проверить `.buildpacks` файл и пересобрать приложение

### Out of memory
✅ Решение: Увеличить план до Professional Pro (1GB RAM)

### Videos not uploading to Spaces
✅ Решение: Проверить все `SPACES_*` переменные и Access Keys

### OAuth redirect errors
✅ Решение: Обновить redirect URIs в Google Cloud Console

---

## 🎉 Готово!

Если все пункты отмечены - ваше приложение готово к production!
