import Stripe from 'stripe';

const isProduction = process.env.NODE_ENV === 'production';

const stripeSecretKey = isProduction
  ? process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY_TEST;

if (!stripeSecretKey) {
  throw new Error('Missing Stripe secret key');
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-11-17.clover',
  typescript: true,
});

export const getStripePublishableKey = () => {
  return isProduction
    ? process.env.STRIPE_PUBLISHABLE_KEY
    : process.env.STRIPE_PUBLISHABLE_KEY_TEST;
};
