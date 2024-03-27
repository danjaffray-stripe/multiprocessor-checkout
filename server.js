const express = require('express');
require('dotenv').config()
const bodyParser = require('body-parser');
const app = express();
app.use(express.static("public"));

const testSecretKey = process.env.TEST_SECRET_KEY
const CHECKOUT_TEST_SECRET_KEY = process.env.CHECKOUT_TWO_TEST_KEY


const stripe = require('stripe')(testSecretKey);
const querystring = require("querystring");  
const { exit } = require('process');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

let port = 4242

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`)
});
  
const createForwardingRequest = async (three_d_secure_data) => {  

  const { authentication_flow, version, electronic_commerce_indicator, cryptogram, transaction_id } = three_d_secure_data

  // Forwarding Config ID for Checkout.com gateway
  const FORWARDING_CONFIG_ID = "fwdcfg_acct_TESTCONFIG_checkout_payments";  

  const bodyData = {  
    config: FORWARDING_CONFIG_ID,  
    payment_method: "pm_1OywS6E16bvDBxZbkGabVgug",  
    url: "https://api.sandbox.checkout.com/payments",
    "request[headers][0][name]": "Authorization",
    "request[headers][0][value]": "Bearer sk_sbox_xr7cwy45awyo37gxiq6iemp62yj",
    "request[headers][1][name]": "Content-Type",
    "request[headers][1][value]": "application/json",
   // "request[headers][2][name]": "User-Agent",
   // "request[headers][2][value]": "PostmanRuntime/7.37.0",
    "request[body]":JSON.stringify(  
    {
      "amount": 10000,
      "currency": "USD",
      "reference": "Visa-USD-Test",
      "3ds": {
        "eci": "05",
        "cryptogram": "M6+990I6FLD8Y6rZz9d5QbfrMNY=",
        "xid": "M6+990I6FLD8Y6rZz9d5QbfrMNY=",
        "version": "2.1.0",
        "exemption": "low_value",
        "challenge_indicator": "no_preference",
      },
      "source": {
        "type": "card",
        "number": "",
        "expiry_month": "",
        "expiry_year": "",
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
  };  
  
  try {  
    const response = await fetch("https://api.stripe.com/v1/forwarding/requests", {  
      method: "POST",  
      headers: {  
        "Content-Type": "application/x-www-form-urlencoded",  
        Authorization: `Bearer ${testSecretKey}`
      },  
      body: querystring.stringify(bodyData),  
    });  
  
    const jsonData = await response.json();  

    console.log(`Endpoint status: ${jsonData.response.status}`);  
    return jsonData;
    
  } catch (error) {  
    console.log("Forwarding Request Error");  
    console.trace(error);  
  }  
};  

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

  console.time(['create-setup-intent'])

    const data = req.body;

    try {
        var order_number = getRandomInt(100000, 999999)
        var order_id = `Order - ${order_number}`

        const setupIntent = await stripe.setupIntents.create({   
            
            automatic_payment_methods:{
              enabled: true,
              allow_redirects: "never"
            },
            //payment_method_types:["card"],
            //confirm:"true",
            usage:"on_session",
            description: order_id,
            customer: "cus_PoEuENNn4JGWab",
            single_use:{
              amount: 2000,
              currency: "eur"
            },
            //confirmation_token: data.confirmationToken.id,
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
    }
});

app.post('/payments', async (req, res) => {
  console.time(['payments endpoint'])

  const data = req.body;
  const setupIntentId = data.setupIntent.id

  try {
    console.time(['retrieve setupIntent'])

    var {payment_method, latest_attempt } = await stripe.setupIntents.retrieve(
      setupIntentId, {
        expand: ['latest_attempt']
      }
    );

    const {payment_method_details: {card: {three_d_secure}}} = latest_attempt;

    console.log(latest_attempt.payment_method_details.card.three_d_secure)
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

    const forwardingRequest = await createForwardingRequest(latest_attempt.payment_method_details.card.three_d_secure)
    
    res.json({
      three_d_secure: latest_attempt.payment_method_details.card.three_d_secure, 
      forwardingRequest: forwardingRequest
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

  /*
  try {
    var order_number = getRandomInt(100000, 999999)
    var order_id = `Order - ${order_number}`

    const paymentIntent = await stripe.paymentIntents.create({    
      automatic_payment_methods:{
        enabled: true,
        allow_redirects: "never"

      },
      confirm:"true",
      off_session: "true",
      description: order_id,
      amount: 2000,
      currency: "eur",
      customer: "cus_PoEuENNn4JGWab",
      expand: ['latest_charge'],
      payment_method: payment_method,
      //error_on_requires_action: "true",
      payment_method_options: {
        card: {
          three_d_secure: {
            version: latest_attempt.payment_method_details.card.three_d_secure.version,
            electronic_commerce_indicator:latest_attempt.payment_method_details.card.three_d_secure.electronic_commerce_indicator,
            cryptogram: "M6+990I6FLD8Y6rZz9d5QbfrMNY=",
            transaction_id: latest_attempt.payment_method_details.card.three_d_secure.transaction_id
          },
        }
      }
    });

    console.log(paymentIntent.status)
    res.json(paymentIntent);
      
  } catch (error) {
      console.log(`PaymentIntent error:  ${error.message}`)
      res.json({
          error: error.message
        });
  }
  */
});

const getRandomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}

const createCustomer = async () => {
    try {
        const customer = await stripe.customers.create({
            email: 'danjaffray@gmail.com'
        });
        console.log(customer.id)
      }
     catch (error) {
        console.log(error.message)
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