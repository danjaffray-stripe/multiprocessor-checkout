async function fetchStripeConfig() {
    try {
        const response = await fetch('/stripe-config');
        const config = await response.json();
      
        if (config.publishableKey) {
            var stripe = Stripe(config.publishableKey);
            return stripe
        } else {
            console.error('Publishable key is missing.');
        }
    } catch (error) {
        console.error('Failed to fetch Stripe configuration:', error);
    }
  }
  