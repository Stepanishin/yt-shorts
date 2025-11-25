# 🚀 Деплой на DigitalOcean Droplet (VPS)

Если вы хотите использовать Droplet вместо App Platform, вы получите полный SSH доступ и сможете установить FFmpeg через `sudo`.

## 📋 Создание Droplet

1. Откройте [DigitalOcean Droplets](https://cloud.digitalocean.com/droplets/new)
2. Выберите:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic (минимум 2GB RAM для FFmpeg)
   - **Region**: Ближайший к вам
   - **Authentication**: SSH keys (рекомендуется) или Password
3. Нажмите **"Create Droplet"**

## 🔐 Подключение по SSH

```bash
ssh root@your-droplet-ip
# или
ssh your-user@your-droplet-ip
```

## 📦 Установка FFmpeg через sudo

```bash
# Обновляем пакеты
sudo apt-get update

# Устанавливаем FFmpeg и все зависимости
sudo apt-get install -y ffmpeg ffprobe

# Проверяем установку
ffmpeg -version
ffprobe -version

# Проверяем поддержку фильтров
ffmpeg -filters | grep drawtext
```

## 🚀 Установка Node.js и приложения

```bash
# Устанавливаем Node.js через nvm (рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Клонируем репозиторий
git clone https://github.com/your-username/shorts-generator.git
cd shorts-generator

# Устанавливаем зависимости
npm install

# Настраиваем переменные окружения
cp env.example .env
nano .env  # Отредактируйте файл

# Собираем приложение
npm run build

# Запускаем через PM2 (рекомендуется)
npm install -g pm2
pm2 start npm --name "shorts-generator" -- start
pm2 save
pm2 startup  # Следуйте инструкциям для автозапуска
```

## 🔄 Настройка Nginx (опционально)

```bash
sudo apt-get install -y nginx

# Создаем конфигурацию
sudo nano /etc/nginx/sites-available/shorts-generator

# Добавляем:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Включаем сайт
sudo ln -s /etc/nginx/sites-available/shorts-generator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## ✅ Преимущества Droplet

- ✅ Полный SSH доступ
- ✅ Можно установить любые пакеты через `sudo apt-get`
- ✅ Полный контроль над системой
- ✅ Дешевле для больших нагрузок

## ⚠️ Недостатки Droplet

- ❌ Нужно самостоятельно управлять сервером
- ❌ Нужно настраивать автозапуск приложения
- ❌ Нужно настраивать SSL сертификаты (Let's Encrypt)
- ❌ Нужно следить за безопасностью

