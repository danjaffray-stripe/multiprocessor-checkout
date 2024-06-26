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

const CHECKOUT_KEY_THREE = process.env.CHECKOUT_KEY_THREE

const querystring = require("querystring");  
const { exit } = require('process');
const { get } = require('http');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

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

app.post('/create-forwarding-request', async (req, res) => {
    const data = req.body;

    try {
        const forwardingRequest = await createForwardingRequest(data.paymentMethod.id)
        res.json(forwardingRequest)
    } catch (error) {
        console.log(error.message)
    }
})

app.post('/create-setup-intent', async (req, res) => {

  const data = req.body;

  console.log(data.confirmationToken.payment_method_preview)
  const name = data.confirmationToken.payment_method_preview.billing_details.name
  const billing_address = data.confirmationToken.payment_method_preview.billing_details.address
  
  console.time(['create-customer'])

  try {
    var customer = await createCustomer(name)
    console.timeEnd(['create-customer'])

    customer = await stripe.customers.update(
      customer.id,
      {
        name: name,
        address: billing_address,
      }
    );

  } catch (error) {
    console.log(`Create Customer error:  ${error.message}`)
    res.json({
      error: error.message
    });
    exit()
  }

  try {
      console.time(['create-setup-intent'])

      var order_number = getRandomInt(100000, 999999)
      var order_id = `Order - ${order_number}`

      const setupIntent = await stripe.setupIntents.create({   
          
          automatic_payment_methods:{
            enabled: true,
            allow_redirects: "never"
          },
          usage:"on_session",
          description: order_id,
          customer: customer.id,
          payment_method_options: {
            card: {
              request_three_d_secure: "any", // any | automatic 
                verify_card_account:"never",
                /*gateway:{
                  acquirer_bin:  "424242",
                  merchant_id:  "MITPOTYGNFQBEVD",
                  requestor_id: "V0000000001234"
              }*/
            }
          }
        });

        res.json(setupIntent);
        console.timeEnd(['create-setup-intent'])
  
  } catch (error) {
      console.log(`Create SetupIntent error:  ${error.message}`)
      res.json({
        error: error.message
      });
      exit()
  }
});

app.post('/payments', async (req, res) => {
  console.time(['payments endpoint'])

  const data = req.body;
  const setupIntentId = data.setupIntent.id

  try {
    console.time(['retrieve setupIntent'])

    var {payment_method, latest_attempt, customer} = await stripe.setupIntents.retrieve(
      setupIntentId, {
        expand: ['latest_attempt', 'customer']
      }
    );

    console.timeEnd(['retrieve setupIntent'])

  } catch (error) {
    console.log(`Retrieve SetupIntent error:  ${error.message}`)    
    res.json({
      error: error.message
    });
    exit()
  }
  
  try {
    console.time(['Forwarding-request'])

    const forwardingRequest = await createForwardingRequest(customer, payment_method, latest_attempt.payment_method_details.card.three_d_secure)
    
    const forwardingResponse = JSON.parse(forwardingRequest.response_details.body)

    try {
      customer = await stripe.customers.update(
        customer.id,
        {
        default_source: payment_method.id,
        invoice_settings:{
          default_payment_method: payment_method.id
        }
      });
      console.log(`Customer updated: ${customer.id}`)

    } catch (error) {
      console.log(`Update Customer error:  ${error.message}`)
    }


    
    
    res.json({
      three_d_secure: latest_attempt.payment_method_details.card.three_d_secure, 
      forwardingRequest: forwardingResponse
      })

    console.timeEnd('Forwarding-request')
    console.timeEnd(['payments endpoint'])

  } catch (error) {
    console.log(`Forwarding error:  ${error.message}`)    
    res.json({
      error: error.message
    });
    exit()
  }

});

const createForwardingRequest = async (customer, payment_method, three_d_secure_data) => {

  const { authentication_flow, version, electronic_commerce_indicator, cryptogram, transaction_id } = three_d_secure_data

  let order_id = getRandomInt(100000, 999999)
  let amount = getRandomInt(10000, 99999)

  try {
    const forwardedReq = await stripe.forwarding.requests.create(
        {
            config: 'fwdcfg_acct_TESTCONFIG_checkout_payments',
            payment_method: payment_method,
            url: 'https://api.sandbox.checkout.com/payments',
            request: {
                headers: [{
                    name: 'Authorization',
                    value: `Bearer ${CHECKOUT_KEY_THREE}`
                }],       
                body: JSON.stringify(  
                  {
                    "amount": amount,
                    "currency": "gbp",
                    "reference": `ORD-${order_id}`,
                    "processing_channel_id": "pc_6ar3fa7ihnkunif27w2eycyj44",
                    "reference": "Visa-USD-Test",
                    "customer": {
                      "email": customer.email,
                      "name": customer.name,
                    },
                    "3ds": {
                      "eci": electronic_commerce_indicator,
                      "cryptogram": "M6+990I6FLD8Y6rZz9d5QbfrMNY=",
                      "xid": transaction_id,
                      "version": version,
                      "exemption": "low_value",
                      "challenge_indicator": "no_preference",
                    },
                    "source": {
                      "type": "card",
                      "number": "",
                      "expiry_month": 0,
                      "expiry_year": 0,
                      "name": "",
                      "cvv": "",
                      "billing_address": {
                        "address_line1": "123 High St.",
                        "address_line2": "Flat 456",
                        "city": "London",
                        "state": "GB",
                        "zip": "SW1A 1AA",
                        "country": "GB"
                      }
                    },
                  }) 
            },
            replacements: ['card_number', 'card_expiry', 'card_cvc', 'cardholder_name'],
        }
    );

    //console.log(JSON.parse(forwardedReq.response_details.body));  

    return forwardedReq;
    
} catch (err) {
    console.log(err.message);
}

}

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
