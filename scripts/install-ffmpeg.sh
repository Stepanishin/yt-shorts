#!/bin/bash

# Скрипт для установки статического FFmpeg binary
# Запускается во время билда на DigitalOcean

echo "📦 Installing static FFmpeg binary..."

# Определяем директорию для установки
if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
elif [ -w "$HOME/.local/bin" ]; then
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
else
  # Создаем локальную директорию в проекте
  INSTALL_DIR="$(pwd)/bin"
  mkdir -p "$INSTALL_DIR"
  export PATH="$INSTALL_DIR:$PATH"
fi

echo "📍 Install directory: $INSTALL_DIR"

# Создаем временную директорию
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Скачиваем статический FFmpeg build
echo "⬇️  Downloading FFmpeg..."
wget -q --show-progress https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz || {
  echo "❌ Failed to download FFmpeg"
  exit 1
}

# Распаковываем
echo "📂 Extracting FFmpeg..."
tar xf ffmpeg-release-amd64-static.tar.xz --strip-components=1

# Копируем бинарники
echo "📋 Installing FFmpeg binaries..."
cp ffmpeg "$INSTALL_DIR/ffmpeg"
cp ffprobe "$INSTALL_DIR/ffprobe"
chmod +x "$INSTALL_DIR/ffmpeg"
chmod +x "$INSTALL_DIR/ffprobe"

# Проверяем установку
echo "✅ FFmpeg installed successfully!"
"$INSTALL_DIR/ffmpeg" -version | head -n 1
"$INSTALL_DIR/ffprobe" -version | head -n 1

# Очищаем
cd /
rm -rf "$TEMP_DIR"

echo "🎉 FFmpeg installation complete!"
echo "📍 Installed to: $INSTALL_DIR"
