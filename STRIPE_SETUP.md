# Настройка кредитной системы и Stripe

## Обзор

Система кредитов позволяет пользователям оплачивать генерацию контента:
- 1 кредит = 1 евро цент (€0.01)
- Новые пользователи получают 50 кредитов бесплатно при регистрации
- Пополнение через Stripe (карточкой)

## Стоимость операций

### Генерация видео-фона
- **Luma Ray v1**: 35 кредитов (€0.35) - AI генерация видео через Luma Dream Machine

### Генерация аудио
- **Udio**: 10 кредитов (€0.10) - AI генерация музыки через Udio

### Другие операции
- **Рендеринг видео**: 0 кредитов (локальная операция)

## Настройка Stripe Webhook

### Для локальной разработки (Stripe CLI)

1. Установите Stripe CLI: https://stripe.com/docs/stripe-cli

2. Авторизуйтесь в Stripe CLI:
```bash
stripe login
```

3. Запустите webhook форвардинг:
```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

4. Скопируйте webhook secret из вывода команды и добавьте в `.env`:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Для продакшена

1. Перейдите в [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)

2. Нажмите "Add endpoint"

3. Введите URL: `https://your-domain.com/api/stripe/webhook`

4. Выберите события для прослушивания:
   - `checkout.session.completed`

5. Скопируйте webhook secret и добавьте в продакшн переменные окружения

## Переменные окружения

Убедитесь, что в `.env` указаны следующие переменные:

```env
# Stripe Production Keys
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...

# Stripe Test Keys
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_SECRET_KEY_TEST=sk_test_...

# Webhook Secret (из Stripe Dashboard или CLI)
STRIPE_WEBHOOK_SECRET=whsec_...
```

## API Endpoints

### Получение баланса
```
GET /api/user/credits
```

### Создание checkout session
```
POST /api/stripe/create-checkout-session
Body: { amount: 500 } // кредиты (минимум 100)
```

### Webhook обработка платежей
```
POST /api/stripe/webhook
```

## Использование

1. Пользователь видит свой баланс на dashboard
2. Нажимает "Пополнить через Stripe"
3. Выбирает сумму (минимум €1.00)
4. Перенаправляется на Stripe Checkout
5. После успешной оплаты возвращается на dashboard
6. Webhook автоматически добавляет кредиты на баланс

## Тестирование

Используйте тестовые карты Stripe:
- Успешная оплата: `4242 4242 4242 4242`
- CVC: любой 3-значный код
- Дата: любая будущая дата

## База данных

Поле `credits` добавлено в коллекцию `users`:
```typescript
interface User {
  _id?: ObjectId;
  googleId: string;
  email: string;
  name: string;
  credits: number; // Баланс кредитов
  // ...
}
```

## Безопасность

- Проверка подписи webhook через Stripe SDK
- Списание кредитов перед генерацией
- Возврат кредитов при ошибке генерации
- Защита от двойного списания через atomic операции MongoDB
