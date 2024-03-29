async function createRandomCustomer() {
    try {
        const response = await fetch('/get-random-customer');
        const customer = await response.json();
      
        return customer   
        
    } catch (error) {
        console.error('Failed to fetch Stripe random Customer:', error);
    }
  }
  