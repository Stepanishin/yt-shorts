#!/bin/bash

# Скрипт для установки FFmpeg
# Пытается установить полную версию через apt-get, если нет - использует статическую сборку
# Запускается во время билда на DigitalOcean

echo "📦 Installing FFmpeg..."

# Проверяем, установлен ли уже FFmpeg
if command -v ffmpeg &> /dev/null; then
  echo "✅ FFmpeg already installed:"
  ffmpeg -version | head -n 1
  
  # Проверяем, поддерживает ли фильтр loop (признак полной версии)
  if ffmpeg -filters 2>/dev/null | grep -q "loop"; then
    echo "✅ Full FFmpeg version detected (supports all filters)"
    exit 0
  else
    echo "⚠️  Static FFmpeg detected, will try to install full version"
  fi
fi

# Пытаемся установить полную версию через apt-get (если есть права)
if command -v apt-get &> /dev/null && [ "$EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
  echo "📦 Installing full FFmpeg via apt-get..."
  
  # Обновляем список пакетов
  if [ "$EUID" -eq 0 ]; then
    apt-get update -qq
    apt-get install -y -qq ffmpeg ffprobe
  else
    sudo apt-get update -qq
    sudo apt-get install -y -qq ffmpeg ffprobe
  fi
  
  if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg installed via apt-get:"
    ffmpeg -version | head -n 1
    echo "🎉 Full FFmpeg installation complete!"
    exit 0
  fi
fi

# Если apt-get не сработал, используем статическую сборку
echo "⚠️  apt-get installation failed or not available, using static build..."

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
echo "⬇️  Downloading static FFmpeg build..."
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

echo "⚠️  Static FFmpeg build installed - some filters may not be available"
echo "📍 Installed to: $INSTALL_DIR"
