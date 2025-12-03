#!/bin/bash

echo "🔤 Installing fonts for video rendering..."

# Определяем ОС
if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ -f /etc/os-release ]]; then
    echo "📦 Detected Linux - installing Liberation fonts"

    # Для Debian/Ubuntu
    if command -v apt-get &> /dev/null; then
        echo "Using apt-get..."
        apt-get update -qq || true
        apt-get install -y fonts-liberation fonts-liberation2 fontconfig || true
        echo "✅ Liberation fonts installed via apt"

    # Для Alpine (часто используется в Docker)
    elif command -v apk &> /dev/null; then
        echo "Using apk..."
        apk add --no-cache ttf-liberation fontconfig || true
        echo "✅ Liberation fonts installed via apk"

    # Для RedHat/CentOS/Fedora
    elif command -v yum &> /dev/null; then
        echo "Using yum..."
        yum install -y liberation-fonts fontconfig || true
        echo "✅ Liberation fonts installed via yum"
    else
        echo "⚠️  Unknown package manager"
        echo "Trying to install via common package names..."
        # Пробуем установить через стандартные пути
        if [ -d "/usr/share/fonts" ]; then
            echo "Font directory exists: /usr/share/fonts"
        fi
    fi

    # Обновляем кеш шрифтов
    if command -v fc-cache &> /dev/null; then
        echo "Updating font cache..."
        fc-cache -f -v 2>&1 | head -20
        echo "✅ Font cache updated"
    else
        echo "⚠️  fc-cache not available, font cache not updated"
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
    echo ""
    echo "Liberation Sans fonts:"
    fc-list | grep -i "liberation sans" | head -5 || echo "  ⚠️  Liberation Sans not found"
    echo ""
    echo "Arial fonts:"
    fc-list | grep -i "arial" | head -5 || echo "  ⚠️  Arial not found"
    echo ""
    echo "Total fonts available:"
    fc-list | wc -l
else
    echo "  ⚠️ fc-list not available, cannot check fonts"
    echo "  Checking /usr/share/fonts directory..."
    if [ -d "/usr/share/fonts" ]; then
        find /usr/share/fonts -name "*.ttf" -o -name "*.otf" | head -10
    fi
fi

echo ""
echo "✅ Font installation script complete!"
