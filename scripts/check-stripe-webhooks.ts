import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Загружаем переменные окружения из .env
dotenv.config({ path: resolve(process.cwd(), '.env') });

const isProduction = process.env.NODE_ENV === 'production';

const stripeSecretKey = isProduction
  ? process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY_TEST;

if (!stripeSecretKey) {
  console.error('❌ Missing Stripe secret key');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey!, {
  apiVersion: '2025-11-17.clover',
  typescript: true,
});

async function checkWebhooks() {
  console.log('🔍 Checking Stripe configuration...\n');
  console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'TEST'}\n`);

  try {
    // 1. Проверяем webhook endpoints
    console.log('📡 Checking webhook endpoints...');
    const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 10 });

    if (webhookEndpoints.data.length === 0) {
      console.log('⚠️  No webhook endpoints found!');
      console.log('   You need to create a webhook endpoint in Stripe dashboard');
      console.log('   URL should be: https://your-domain.com/api/stripe/webhook');
      console.log('   Events to subscribe to: checkout.session.completed');
    } else {
      console.log(`✅ Found ${webhookEndpoints.data.length} webhook endpoint(s):\n`);
      webhookEndpoints.data.forEach((endpoint, index) => {
        console.log(`   ${index + 1}. ${endpoint.url}`);
        console.log(`      Status: ${endpoint.status}`);
        console.log(`      Events: ${endpoint.enabled_events.join(', ')}`);
        console.log(`      Created: ${new Date(endpoint.created * 1000).toISOString()}`);
        console.log();
      });
    }

    // 2. Проверяем последние события
    console.log('\n📋 Checking recent webhook events (last 10)...');
    const events = await stripe.events.list({ limit: 10 });

    if (events.data.length === 0) {
      console.log('⚠️  No events found');
    } else {
      console.log(`\nFound ${events.data.length} recent events:\n`);
      events.data.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.type}`);
        console.log(`      ID: ${event.id}`);
        console.log(`      Created: ${new Date(event.created * 1000).toISOString()}`);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session;
          console.log(`      Session ID: ${session.id}`);
          console.log(`      Payment Status: ${session.payment_status}`);
          console.log(`      Amount: ${session.amount_total ? session.amount_total / 100 : 0} ${session.currency?.toUpperCase()}`);
          console.log(`      Metadata:`, session.metadata);
        }
        console.log();
      });
    }

    // 3. Проверяем последние checkout sessions
    console.log('\n🛒 Checking recent checkout sessions (last 10)...');
    const sessions = await stripe.checkout.sessions.list({ limit: 10 });

    if (sessions.data.length === 0) {
      console.log('⚠️  No checkout sessions found');
    } else {
      console.log(`\nFound ${sessions.data.length} recent sessions:\n`);
      sessions.data.forEach((session, index) => {
        console.log(`   ${index + 1}. Session ID: ${session.id}`);
        console.log(`      Status: ${session.status}`);
        console.log(`      Payment Status: ${session.payment_status}`);
        console.log(`      Amount: ${session.amount_total ? session.amount_total / 100 : 0} ${session.currency?.toUpperCase()}`);
        console.log(`      Created: ${new Date(session.created * 1000).toISOString()}`);
        console.log(`      Metadata:`, session.metadata);
        console.log();
      });
    }

    // 4. Проверяем баланс
    console.log('\n💰 Checking account balance...');
    const balance = await stripe.balance.retrieve();
    console.log('Available balance:');
    balance.available.forEach(b => {
      console.log(`   ${b.amount / 100} ${b.currency.toUpperCase()}`);
    });

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

checkWebhooks();
