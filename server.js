const express = require('express');
require('dotenv').config()
const bodyParser = require('body-parser');

const app = express();
app.use(express.static("public"));

// -- Initialize Stripe --
const initializeStripe = require('./configStripe');

// -- Random Name Generator --
const randomNameGenerator = require('./random_generator/randomNameGenerator');

// Init based on your current need
var stripe = initializeStripe('GB');

const { exit, off } = require('process');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())



// Centralized error-handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

let port = 4242

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`)
});

app.get('/stripe-config', (req, res) => {
  const env = process.env.TEST_COUNTRY || 'GB'; // Defaulting to 'dev' if TEST_COUNTRY isn't set
  let publishableKey;

  switch (env) {
      case 'GB':
          publishableKey = process.env.GB_STRIPE_ACCOUNT_PUBLISHABLE_KEY;
          break;
      case 'IE':
          publishableKey = process.env.IE_STRIPE_ACCOUNT_PUBLISHABLE_KEY;
          break;
    }

  if(publishableKey) {
      res.json({ publishableKey });
  } else {
      res.status(500).json({ error: 'Unable to retrieve Stripe configuration.' });
  }
});

app.get('/get-random-customer', async (req, res) => {

  const details = await randomNameGenerator()
  res.json(details)

})

app.post('/create-setup-intent', async (req, res) => {
  console.time('POST /create-setup-intent');
  
  const data = req.body;
  const { name, address: billing_address } = data.confirmationToken.payment_method_preview.billing_details;

  console.time('- create-customer');

  try {
    let customer = await createCustomer(name);
    
    console.timeEnd('- create-customer');

    // Updating customer concurrently in a separate promise
    const updateCustomerPromise = stripe.customers.update(
      customer.id,
      { name, address: billing_address }
    );

    // Generate order number and ID
    const order_number = getRandomInt(100000, 999999);
    const order_id = `Order - ${order_number}`;

    // Create setup intent concurrently
    console.time('- create-setup-intent');
    
    const setupIntentPromise = stripe.setupIntents.create({
      single_use: {
        amount: 1000,
        currency: 'gbp',
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      usage: 'on_session',
      description: order_id,
      customer: customer.id,
      use_stripe_sdk: 'true',
      payment_method_options: {
        card: {
          request_three_d_secure: 'any', // any | automatic 
          verify_card_account: 'never',
          /*gateway: {
            acquirer_bin:  '424242',
            merchant_id:  'MITPOTYGNFQBEVD',
            requestor_id: 'V0000000001234',
          }*/
        }
      }
    });

    // Await both the setup intent creation and customer update
    const [updateCustomerResult, setupIntent] = await Promise.all([updateCustomerPromise, setupIntentPromise]);
    
    console.timeEnd('- create-setup-intent');
    
    res.json(setupIntent);
    console.timeEnd('POST /create-setup-intent');

  } catch (error) {
    console.log(`Error: ${error.message}`);
    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/payments', async (req, res) => {
  console.time('POST /payments');
  
  const data = req.body;
  const setupIntentId = data.setupIntent.id;

  try {
    console.time('- retrieve setupIntent');

    const { payment_method, latest_attempt, customer } = await stripe.setupIntents.retrieve(
      setupIntentId, {
        expand: ['latest_attempt', 'customer'],
      }
    );

    console.log(latest_attempt.payment_method_details.card.three_d_secure);

    console.timeEnd('- retrieve setupIntent');

    console.time('- create-payment-intent');
    
    const paymentIntentPromise = stripe.paymentIntents.create({
      amount: 1000,
      currency: 'gbp',
      payment_method: payment_method,
      confirm: true,
      payment_method_options: {
        card: {
          three_d_secure:{
            electronic_commerce_indicator: latest_attempt.payment_method_details.card.three_d_secure.electronic_commerce_indicator,
            version: latest_attempt.payment_method_details.card.three_d_secure.version,
            cryptogram: latest_attempt.payment_method_details.card.three_d_secure.cryptogram,
            transaction_id: latest_attempt.payment_method_details.card.three_d_secure.transaction_id,
            cryptogram: "CJSJbzXT6TRQlvZDX+ZdOG4QriE=",
          }
        }
      },
      return_url: `http://localhost:4242/forwarding-request?setupIntentId=${setupIntentId}`,
      customer: customer.id,
    });

    const updateCustomerPromise = stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: payment_method
      }
    });

    const [paymentIntent, customerUpdate] = await Promise.all([paymentIntentPromise, updateCustomerPromise]);
    
    console.timeEnd('- create-payment-intent');
    console.timeEnd('POST /payments');
    res.json({
      three_d_secure: latest_attempt.payment_method_details.card.three_d_secure,
      paymentIntent: paymentIntent
    });
    
  } catch (error) {
    console.log(`Error: ${error.message}`);
    res.status(500).json({
      error: error.message,
    });
  }
});




const getRandomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}

const createCustomer = async (name) => {
  let int = getRandomInt(1000,9999)

  var details = await randomNameGenerator()

  if (name) {
    details = name
    const customer = await stripe.customers.create({
      name: details,
    });
    return customer
  } 

    try {
        const customer = await stripe.customers.create({
            id: `${details.firstName.toLowerCase()}-${details.lastName.toLowerCase()}-${int}`,
            email: details.email,
            name: details.name,
        });
        return customer
      }
     catch (error) {
        console.log(error.message)
        return null
    }
  }

const createPaymentMethod = async (card) => {
    try {
        const paymentMethod = await stripe.paymentMethods.create({
            type: 'card',
            card: {
              number: card.number,
              exp_month: card.exp_month,
              exp_year: card.exp_year,
              cvc: card.cvc,
            },
          });
        console.log(paymentMethod)
        return paymentMethod

    } catch (error) {
        console.log(error.message)
    }
}

app.post('/webhook', express.json({type: 'application/json'}), (request, response) => {
  const event = request.body;

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      // Then define and call a method to handle the successful payment intent.
      // handlePaymentIntentSucceeded(paymentIntent);
      break;
    case 'payment_method.attached':
      const paymentMethod = event.data.object;
      // Then define and call a method to handle the successful attachment of a PaymentMethod.
      // handlePaymentMethodAttached(paymentMethod);
      break;
    case 'setup_intent.succeeded':
      console.log(event.data.object)
    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  response.json({received: true});
});
