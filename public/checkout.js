
const testPublishabletKey = "pk_test_51KqK28E16bvDBxZbHHkDwYbHaxcMWqBm03u5BcKTSiv0fMab2gxLCPrESpLRRvzjHV8oEwlsZsBrO71ImLF0JYmA00DWNfbxvf"

const stripe = Stripe(testPublishabletKey, options = {
  betas: ['elements_enable_deferred_intent_beta_1', 'deferred_intent_pe_optional_amount_beta_0']});

let elements
let paymentElement
let response
let jsonData

initialize();

document.querySelector("#payment-form")
document.addEventListener("submit", handleSubmit);

// ------- Initialize Stripe Elements -------
async function initialize() {

  let amount = 1000;

  showAmount(amount);

  elements = stripe.elements({
    mode: 'setup',
    //amount: amount,
    setupFutureUsage: 'on_session',
    paymentMethodCreation: 'manual',

  });

  const paymentElementOptions = {
    layout: "accordion",
    fields: {
      billingDetails: "auto"
    }
  };

  paymentElement = elements.create("payment", paymentElementOptions);
  paymentElement.mount("#payment-element");

  var emailInput = document.getElementById('email');
 
  // Attach the event listener for the 'submit' event
    emailInput.addEventListener('change', function() {
      paymentElement.update({defaultValues: {billingDetails: {email: emailInput.value}}});
  });

  paymentElement.on('change', function(event) {
    console.log(event);
  });

}

// ------- Handle Payment Submission -------
async function handleSubmit(e) {

  console.time(['handleSubmit'])
  
  e.preventDefault();
  setLoading(true);

  const {error: submitError} = await elements.submit();

  if (submitError) {
    showMessage(submitError);
    return;
  }
  //  ------- Create PaymentMethod from Payment Element ------- 
  try {

    console.time(['create Confirmation Token'])

    var { confirmationToken } = await stripe.createConfirmationToken({elements}); 
    console.log(`confirmationToken created: ${confirmationToken.id} `)

    showMessage("confirmationToken created successfully}");
    console.timeEnd(['create Confirmation Token'])

  } catch (error) {
    console.log(error.message);
    showMessage(error.message);
    setLoading(false);

  }

  // ------- Create SetupIntent to run 3DSecure ------- 
  try {
    
    console.time(['create SetupIntent'])

    response = await fetch("/create-setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationToken }),
    });

    jsonData = await response.json();
    showMessage("SetupIntent created successfully");
    console.timeEnd(['create SetupIntent'])

  } catch (error) {
    console.log(error.message); 
    setLoading(false);
    showMessage(error.message);
    console.timeEnd(['create SetupIntent'])
  }

  //  ------- Run 3DSecure on clientSide ------- 
  // The payment_method was associated with the SetupIntent above, so we only need the client secret to run 3DSecure
  try {
    
    console.time(['Run 3DSecure'])

    var { setupIntent, error}  = await stripe.confirmSetup({
      clientSecret: jsonData.client_secret,
      confirmParams: {
        return_url: 'https://example.com',
        confirmation_token: confirmationToken.id,
      },
      redirect: 'if_required',
    });

    if (error) {
      console.log(error.message);
      showMessage(error.message);
      setLoading(false);
      console.timeEnd(['Run 3DSecure'])
      return

    } else {
      showMessage(setupIntent.status);
    }
    console.timeEnd(['Run 3DSecure'])


  } catch (error) {
    console.log(error.message);
    setLoading(false);
    showMessage(error.message);
  }

  //  ------- Send SetupIntent to Server ------- 
  try {
    
    console.time(['Send SetupIntent to Server'])

    response = await fetch("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntent }),
    });

    jsonData = await response.json();
    console.log(jsonData)
    console.timeEnd(['Send SetupIntent to Server'])


  } catch (error) {
    console.log(error.message);
    setLoading(false);
    showMessage(error.message);

  }
  showMessage("PaymentIntent created successfully");
  setLoading(false);
  console.timeEnd(['handleSubmit'])

}

// ------- UI helpers -------
function showMessage(messageText) {
  const messageContainer = document.querySelector("#payment-message");

  messageContainer.classList.remove("hidden");
  messageContainer.textContent = messageText;

  setTimeout(function () {
    messageContainer.classList.add("hidden");
  }, 6000);
}

function showAmount(amount) {
  const messageContainer = document.querySelector("#amount-element");

  messageContainer.innerHTML = `£${amount / 100}`;

}

function showResult(messageText) {
  const messageContainer = document.querySelector("#result-message");
  messageContainer.classList.remove("hidden");

  messageContainer.innerHTML = `<pre> ${messageText} </pre>`;

  setTimeout(function () {
    messageContainer.classList.add("hidden");
  }, 6000);

}

// ------- Show a spinner on payment submission -------- 
function setLoading(isLoading) {
  if (isLoading) {
    // Disable the button and show a spinner
    document.querySelector("#submit").disabled = true;
    document.querySelector("#spinner").classList.remove("hidden");
    document.querySelector("#button-text").classList.add("hidden");
  } else {
    document.querySelector("#submit").disabled = false;
    document.querySelector("#spinner").classList.add("hidden");
    document.querySelector("#button-text").classList.remove("hidden");
  }
}