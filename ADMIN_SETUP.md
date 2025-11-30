# Admin Setup Guide

## Как сделать пользователя администратором

Для того чтобы дать пользователю права администратора, нужно установить поле `isAdmin: true` в документе пользователя в MongoDB.

### Способ 1: Через MongoDB Compass (GUI)

1. Откройте MongoDB Compass
2. Подключитесь к вашей базе данных
3. Найдите коллекцию `users`
4. Найдите нужного пользователя (по email или googleId)
5. Нажмите "Edit Document"
6. Добавьте или измените поле `isAdmin` на `true`
7. Сохраните изменения

### Способ 2: Через MongoDB Shell

Подключитесь к вашей базе данных и выполните следующую команду:

```javascript
// По email пользователя
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { isAdmin: true } }
)

// Или по Google ID
db.users.updateOne(
  { googleId: "GOOGLE_ID_HERE" },
  { $set: { isAdmin: true } }
)
```

### Способ 3: Через mongosh CLI

```bash
mongosh "YOUR_MONGODB_CONNECTION_STRING"

# В mongosh:
use your_database_name
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { isAdmin: true } }
)
```

## Что получает администратор?

Пользователи с `isAdmin: true` имеют доступ к:

1. **Jokes Library** (`/dashboard/jokes`) - библиотека анекдотов
   - Просмотр всех анекдотов в системе
   - Управление коллекцией анекдотов

2. **Configure Button** (на странице Settings) - расширенные настройки YouTube
   - Настройка собственных OAuth credentials для YouTube
   - Расширенные опции интеграции

## Проверка прав администратора

После установки флага `isAdmin`:

1. Выйдите из системы и войдите снова (или обновите сессию)
2. Проверьте, что в боковом меню появился пункт "Jokes Library"
3. Проверьте, что на странице Settings появилась кнопка "Configure"

## Отмена прав администратора

Чтобы убрать права администратора:

```javascript
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { isAdmin: false } }
)
```

Или удалить поле полностью:

```javascript
db.users.updateOne(
  { email: "user@example.com" },
  { $unset: { isAdmin: "" } }
)
```
