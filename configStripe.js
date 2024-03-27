require('dotenv').config();
const Stripe = require('stripe');

/**
 * Initializes Stripe with keys based on the environment provided.
 * 
 * @param {string} account - The Stripe account to use ('IE', 'GB', etc.)
 * @returns {Stripe} A Stripe instance configured with the appropriate keys.
 */
function initializeStripe(account) {
  let secretKey, publishableKey;

  switch (account) {
    case 'GB':
      secretKey = process.env.GB_STRIPE_SECRET_KEY;
      publishableKey = process.env.GB_STRIPE_PUBLISHABLE_KEY;
      break;
    case 'IE':
      secretKey = process.env.TEST_STRIPE_SECRET_KEY;
      publishableKey = process.env.TEST_STRIPE_PUBLISHABLE_KEY;
      break;
    // Add more cases for other environments as needed
    default:
      throw new Error('Invalid or unsupported environment specified.');
  }

  // Ensure the keys are available
  if (!secretKey || !publishableKey) {
    throw new Error('Stripe API keys not provided for environment: ' + env);
  }

  // Initialize and return the Stripe instance
  const stripe = Stripe(secretKey);
  
  // Optionally, you can add the publishableKey to the returned object if needed:
  // stripe.publishableKey = publishableKey;
  
  return stripe;
}

module.exports = initializeStripe;