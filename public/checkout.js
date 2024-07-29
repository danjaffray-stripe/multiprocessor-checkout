
let elements
var stripe

initialize();

document.querySelector("#payment-form")
document.addEventListener("submit", handleSubmit);

// ------- Initialize Stripe Elements -------
async function initialize() {

  stripe = await fetchStripeConfig();
  customer = await createRandomCustomer();

  let amount = 1000;

  showAmount(amount);

  elements = stripe.elements({
    mode: 'setup',
    //amount: amount,
    currency: 'gbp', // optional when betas are enabled
    setupFutureUsage: 'on_session',
    paymentMethodCreation: 'manual',

  });

  const billingDetails = {
    name: customer.name,
    email: customer.email,

  };

  const paymentElementOptions = {
    layout: "accordion",
    defaultValues:{
      billingDetails: billingDetails
    },
    fields: {
      billingDetails: "auto"
    }
  };

  const addressElementOptions = { mode: 'billing',
  defaultValues: billingDetails
};
  const addressElement = elements.create('address', addressElementOptions);

  addressElement.mount('#address-element');

  var paymentElement = elements.create("payment", paymentElementOptions);

  paymentElement.mount("#payment-element");

  var emailInput = document.getElementById('email');
  emailInput.value = customer.email;
 
  // Attach the event listener for the 'submit' event
    emailInput.addEventListener('change', function() {
      paymentElement.update({defaultValues: {billingDetails: {email: emailInput.value}}});
  });

  paymentElement.on('change', function(event) {
    console.log(event);
  });

}

async function handleSubmit(e) {
  console.time('handleSubmit');
  
  e.preventDefault();
  setLoading(true);

  try {
    const { error: submitError } = await elements.submit();
    
    if (submitError) {
      showMessage(submitError);
      setLoading(false);
      return;
    }

    // Create a confirmationToken
    console.time('create Confirmation Token');
 
    const { confirmationToken } = await stripe.createConfirmationToken({
      elements, 
      params: {
        payment_method_data: {
          billingDetails: elements.getElement('address').billingDetails,
        },
      },
    });

    console.log(`confirmationToken created: ${confirmationToken.id}`);
    showMessage("confirmationToken created successfully");
    console.timeEnd('create Confirmation Token');

    // Create a SetupIntent
    console.time('create SetupIntent');

    const setupIntentResponse = await fetch("/create-setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationToken }),
    });

    const setupIntentData = await setupIntentResponse.json();
    
    showMessage("SetupIntent created successfully");
    console.timeEnd('create SetupIntent');

    // Run 3DSecure
    console.time('Run 3DSecure');

    const { setupIntent, error: confirmError } = await stripe.confirmSetup({
      clientSecret: setupIntentData.client_secret,
      confirmParams: {
        return_url: 'https://example.com',
        confirmation_token: confirmationToken.id,
      },
      redirect: 'if_required',
    });

    if (confirmError) {

      console.log(confirmError.message);
      showMessage(confirmError.message);
      setLoading(false);
      console.timeEnd('Run 3DSecure');
      return;
    } else {

      showMessage(setupIntent.status);
    }
    
    console.timeEnd('Run 3DSecure');

    // Send SetupIntent to Server
    console.time('Send SetupIntent to Server');

    const paymentResponse = await fetch("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntent }),
    });

    const paymentData = await paymentResponse.json();
    
    console.log(paymentData);
    showMessage("PaymentIntent created successfully");
    
    console.timeEnd('Send SetupIntent to Server');

  } catch (error) {
    console.log(error.message);

    showMessage(error.message);
    setLoading(false);

  } finally {
    
    setLoading(false);
    console.timeEnd('handleSubmit');
  }
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