import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';

// Загружаем переменные окружения из .env
dotenv.config({ path: resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI');
  process.exit(1);
}

async function checkTransactions() {
  console.log('🔍 Checking database transactions...\n');

  const client = new MongoClient(MONGODB_URI!);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db();

    // 1. Проверяем всех пользователей
    console.log('👥 Users with their credit balances:');
    const users = await db.collection('users')
      .find({})
      .project({ email: 1, name: 1, credits: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .toArray();

    if (users.length === 0) {
      console.log('   No users found');
    } else {
      users.forEach((user, index) => {
        console.log(`\n   ${index + 1}. ${user.email}`);
        console.log(`      Name: ${user.name}`);
        console.log(`      Credits: ${user.credits}`);
        console.log(`      User ID: ${user._id.toString()}`);
        console.log(`      Created: ${user.createdAt}`);
      });
    }

    // 2. Проверяем последние транзакции
    console.log('\n\n💳 Recent transactions (last 20):');
    const transactions = await db.collection('credit_transactions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    if (transactions.length === 0) {
      console.log('   No transactions found');
    } else {
      for (const [index, tx] of transactions.entries()) {
        const user = await db.collection('users').findOne({ _id: tx.userId });

        console.log(`\n   ${index + 1}. ${tx.type.toUpperCase()} - ${tx.reason}`);
        console.log(`      User: ${user?.email || 'Unknown'} (${tx.userId.toString()})`);
        console.log(`      Amount: ${tx.amount} credits`);
        console.log(`      Balance: ${tx.balanceBefore} → ${tx.balanceAfter}`);
        console.log(`      Description: ${tx.description || 'N/A'}`);
        console.log(`      Created: ${tx.createdAt}`);

        if (tx.metadata) {
          console.log(`      Metadata:`, tx.metadata);
        }
      }
    }

    // 3. Проверяем транзакции покупок (purchase)
    console.log('\n\n🛒 Purchase transactions:');
    const purchaseTransactions = await db.collection('credit_transactions')
      .find({ reason: 'purchase' })
      .sort({ createdAt: -1 })
      .toArray();

    if (purchaseTransactions.length === 0) {
      console.log('   ⚠️  No purchase transactions found!');
      console.log('   This might indicate that webhooks are not working properly.');
    } else {
      console.log(`\n   Found ${purchaseTransactions.length} purchase transaction(s):\n`);

      for (const [index, tx] of purchaseTransactions.entries()) {
        const user = await db.collection('users').findOne({ _id: tx.userId });

        console.log(`   ${index + 1}. User: ${user?.email || 'Unknown'}`);
        console.log(`      Amount: ${tx.amount} credits`);
        console.log(`      Created: ${tx.createdAt}`);

        if (tx.metadata?.stripeSessionId) {
          console.log(`      Stripe Session ID: ${tx.metadata.stripeSessionId}`);
        }
        if (tx.metadata?.amountPaid) {
          console.log(`      Amount Paid: €${tx.metadata.amountPaid}`);
        }
        console.log();
      }
    }

    // 4. Статистика
    console.log('\n📊 Statistics:');
    const totalDeposits = await db.collection('credit_transactions')
      .aggregate([
        { $match: { type: 'deposit' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
      .toArray();

    const totalWithdrawals = await db.collection('credit_transactions')
      .aggregate([
        { $match: { type: 'withdrawal' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
      .toArray();

    console.log(`   Total deposits: ${totalDeposits[0]?.total || 0} credits`);
    console.log(`   Total withdrawals: ${totalWithdrawals[0]?.total || 0} credits`);
    console.log(`   Net balance: ${(totalDeposits[0]?.total || 0) - (totalWithdrawals[0]?.total || 0)} credits`);

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkTransactions();
