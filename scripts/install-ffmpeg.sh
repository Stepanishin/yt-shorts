#!/bin/bash

# Скрипт для установки статического FFmpeg binary
# Запускается во время билда на DigitalOcean

set -e

echo "📦 Installing static FFmpeg binary..."

# Создаем директорию для FFmpeg
mkdir -p /tmp/ffmpeg-bin

# Скачиваем статический FFmpeg build (John Van Sickle builds)
cd /tmp/ffmpeg-bin
wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz

# Распаковываем
echo "📂 Extracting FFmpeg..."
tar xf ffmpeg-release-amd64-static.tar.xz --strip-components=1

# Копируем бинарники в /usr/local/bin (доступен в PATH)
echo "📍 Installing FFmpeg to /usr/local/bin..."
cp ffmpeg /usr/local/bin/ffmpeg
cp ffprobe /usr/local/bin/ffprobe
chmod +x /usr/local/bin/ffmpeg
chmod +x /usr/local/bin/ffprobe

# Проверяем установку
echo "✅ FFmpeg installed successfully!"
/usr/local/bin/ffmpeg -version | head -n 1
/usr/local/bin/ffprobe -version | head -n 1

# Очищаем временные файлы
cd /
rm -rf /tmp/ffmpeg-bin

echo "🎉 FFmpeg installation complete!"
