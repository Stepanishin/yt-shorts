import { ObjectId } from "mongodb";
import { getMongoDatabase } from "./mongodb";

export type TransactionType = "deposit" | "withdrawal";
export type TransactionReason =
  | "purchase" // Покупка кредитов через Stripe
  | "video_generation" // Генерация видео
  | "background_generation" // Генерация фона
  | "audio_generation" // Генерация аудио
  | "video_rendering" // Рендеринг видео
  | "manual_adjustment" // Ручная корректировка администратором
  | "initial_balance"; // Начальный баланс

export interface CreditTransaction {
  _id?: ObjectId;
  userId: ObjectId;
  type: TransactionType;
  amount: number; // Сумма в кредитах (евро центах)
  reason: TransactionReason;
  description?: string; // Описание транзакции
  metadata?: {
    // Дополнительные данные для разных типов транзакций
    stripeSessionId?: string; // Для покупок через Stripe
    videoJobId?: string; // Для операций с видео
    jokeId?: string; // ID шутки, если применимо
    [key: string]: unknown;
  };
  balanceBefore: number; // Баланс до транзакции
  balanceAfter: number; // Баланс после транзакции
  createdAt: Date;
}

const COLLECTION_NAME = "credit_transactions";

export async function getTransactionCollection() {
  const db = await getMongoDatabase();
  return db.collection<CreditTransaction>(COLLECTION_NAME);
}

/**
 * Создает транзакцию кредитов
 */
export async function createTransaction(
  userId: string,
  type: TransactionType,
  amount: number,
  reason: TransactionReason,
  balanceBefore: number,
  balanceAfter: number,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<CreditTransaction> {
  const collection = await getTransactionCollection();

  const transaction: Omit<CreditTransaction, "_id"> = {
    userId: new ObjectId(userId),
    type,
    amount,
    reason,
    description,
    metadata,
    balanceBefore,
    balanceAfter,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(transaction as CreditTransaction);

  return {
    ...transaction,
    _id: result.insertedId,
  };
}

/**
 * Получает историю транзакций пользователя
 */
export async function getUserTransactions(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: TransactionType;
    reason?: TransactionReason;
  }
): Promise<CreditTransaction[]> {
  const collection = await getTransactionCollection();

  const query: Record<string, unknown> = {
    userId: new ObjectId(userId),
  };

  if (options?.type) {
    query.type = options.type;
  }

  if (options?.reason) {
    query.reason = options.reason;
  }

  const cursor = collection
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit || 100)
    .skip(options?.offset || 0);

  return cursor.toArray();
}

/**
 * Получает общую статистику транзакций пользователя
 */
export async function getUserTransactionStats(userId: string): Promise<{
  totalDeposits: number;
  totalWithdrawals: number;
  transactionCount: number;
}> {
  const collection = await getTransactionCollection();

  const [deposits, withdrawals, count] = await Promise.all([
    collection
      .aggregate<{ total: number }>([
        { $match: { userId: new ObjectId(userId), type: "deposit" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    collection
      .aggregate<{ total: number }>([
        { $match: { userId: new ObjectId(userId), type: "withdrawal" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    collection.countDocuments({ userId: new ObjectId(userId) }),
  ]);

  return {
    totalDeposits: deposits[0]?.total || 0,
    totalWithdrawals: withdrawals[0]?.total || 0,
    transactionCount: count,
  };
}

