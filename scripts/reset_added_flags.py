#!/usr/bin/env python3
"""
Скрипт для сброса всех флагов 'added' в false в файле chistes_ricuib.json

Использование:
    python3 scripts/reset_added_flags.py
"""

import json
import sys
from pathlib import Path

def main():
    # Путь к JSON файлу
    json_path = Path(__file__).parent.parent / 'chistes_ricuib.json'

    if not json_path.exists():
        print(f"❌ Файл не найден: {json_path}")
        sys.exit(1)

    print(f"📖 Читаем файл: {json_path}")

    # Читаем JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        chistes = json.load(f)

    print(f"   Всего шуток: {len(chistes)}")

    # Считаем текущее состояние
    added_true_before = sum(1 for c in chistes if c.get('added') == True)
    added_false_before = sum(1 for c in chistes if c.get('added') == False)

    print(f"\n📊 До сброса:")
    print(f"   added: true  - {added_true_before} шуток")
    print(f"   added: false - {added_false_before} шуток")

    # Сбрасываем все в false
    for chiste in chistes:
        chiste['added'] = False

    # Сохраняем
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(chistes, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Все {len(chistes)} шуток сброшены!")
    print(f"   added: true  - 0 шуток")
    print(f"   added: false - {len(chistes)} шуток")
    print(f"\n🎯 Готово! Теперь можно импортировать шутки заново.")

if __name__ == "__main__":
    main()
