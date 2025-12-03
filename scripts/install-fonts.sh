#!/bin/bash

echo "🔤 Installing fonts for video rendering..."

# Определяем ОС
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "📦 Detected Linux - installing Liberation fonts"

    # Для Debian/Ubuntu
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y fonts-liberation fonts-liberation2
        echo "✅ Liberation fonts installed via apt"

    # Для Alpine (часто используется в Docker)
    elif command -v apk &> /dev/null; then
        apk add --no-cache ttf-liberation
        echo "✅ Liberation fonts installed via apk"

    # Для RedHat/CentOS/Fedora
    elif command -v yum &> /dev/null; then
        yum install -y liberation-fonts
        echo "✅ Liberation fonts installed via yum"
    else
        echo "⚠️  Unknown package manager, please install Liberation fonts manually"
    fi

    # Обновляем кеш шрифтов
    if command -v fc-cache &> /dev/null; then
        fc-cache -f -v
        echo "✅ Font cache updated"
    fi

elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Detected macOS - Arial should be pre-installed"
    echo "✅ No additional fonts needed"
else
    echo "⚠️  Unknown OS: $OSTYPE"
fi

# Проверяем доступные шрифты
echo ""
echo "📋 Checking available fonts..."
if command -v fc-list &> /dev/null; then
    echo "Liberation Sans fonts:"
    fc-list | grep -i "liberation sans" || echo "  ⚠️  Liberation Sans not found"
    echo ""
    echo "Arial fonts:"
    fc-list | grep -i "arial" || echo "  ⚠️  Arial not found"
else
    echo "  fc-list not available, cannot check fonts"
fi

echo ""
echo "✅ Font installation complete!"
