# Датасет немецких шуток из Schlechtewitzefront

## Общая информация

- **Всего шуток**: 5,000 (отфильтровано из 162,302)
- **Источник**: Schlechtewitzefront
- **Формат**: JSON
- **Файл**: `witze_schlechtewitzefront.json`
- **Язык**: Немецкий (de)

## Структура данных

```json
{
  "index": 256,
  "texto": "Текст шутки на немецком",
  "votos": 15,
  "fecha": "2015-09-22 16:24:10",
  "usuario": "LW-App",
  "added": false,
  "origen": "Schlechtewitzefront"
}
```

| Поле | Описание |
|------|----------|
| `index` | Оригинальный ID из базы данных |
| `texto` | Текст шутки |
| `votos` | Количество голосов (рейтинг) |
| `fecha` | Дата добавления |
| `usuario` | Пользователь, добавивший шутку |
| `added` | Флаг - была ли шутка импортирована в MongoDB |
| `origen` | Источник данных |

## Фильтрация

При создании файла были применены следующие фильтры:

1. **Длина текста**: 30-700 символов
2. **Язык**: Только немецкий (отфильтрованы английские шутки)
3. **Контент**: Убран неприемлемый контент
4. **Приоритет**: Сначала шутки с голосами, затем случайная выборка

## Примеры шуток

### С высоким рейтингом

**15 голосов:**
> ich habe geheult als mein vater zwiebel gehackt hat.
> zwiebel war eine so gute katze.

**13 голосов:**
> Mein Kaffee ist so schwarz, den muss ich mit der Linken trinken, weil er keine Rechte hat

**6 голосов:**
> Warum ich Single bin? Das ist wie bei dem letzten Stück Pizza. Alle wollen es, aber keiner traut sich.

### Flachwitze (каламбуры)

> Wie nennt man den Muttertag im Saarland noch? Valentinstag

> Ich habe mir eine zweite Schneeschaufel für den Winter gekauft. Ich Paarshippe jetzt.

## Источник

**GitHub**: https://github.com/JohannesBauer97/Schlechtewitzefront
**Лицензия**: MIT License
**Оригинальная база**: ~182,000 шуток
**Дата получения**: 2026-01-17

## Использование

### Python
```python
import json

# Загрузить все шутки
with open('witze_schlechtewitzefront.json', 'r', encoding='utf-8') as f:
    witze = json.load(f)

# Фильтр только шуток с голосами
top_rated = [w for w in witze if w['votos'] > 0]

# Фильтр не добавленных
not_added = [w for w in witze if not w['added']]
```

### Импорт в базу данных

Используйте скрипт `scripts/import-witze-jokes.ts` (по аналогии с `import-ricuib-jokes.ts`):

```bash
npx tsx scripts/import-witze-jokes.ts
```

## Скрипты

| Скрипт | Описание |
|--------|----------|
| `scripts/parse-witze-sql.py` | Парсит SQL дамп и создает JSON |
