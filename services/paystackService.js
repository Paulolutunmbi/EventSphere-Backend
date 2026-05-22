const PAYSTACK_BASE_URL = 'https://api.paystack.co'

function getPaystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new Error('Paystack secret key is missing')
  }
  return key
}

function buildHeaders() {
  return {
    Authorization: `Bearer ${getPaystackSecretKey()}`,
    'Content-Type': 'application/json',
  }
}

export async function initializePaystackPayment({ email, amount, currency = 'NGN', callbackUrl, metadata, channels }) {
  const body = {
    email,
    amount,
    currency,
    callback_url: callbackUrl,
    metadata,
    channels,
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  })

  const payload = await response.json()
  if (!response.ok || !payload.status) {
    throw new Error(payload?.message || 'Failed to initialize Paystack payment')
  }

  return {
    authorizationUrl: payload.data.authorization_url,
    reference: payload.data.reference,
    accessCode: payload.data.access_code,
  }
}

export async function verifyPaystackPayment(reference) {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: buildHeaders() }
  )

  const payload = await response.json()
  if (!response.ok || !payload.status) {
    throw new Error(payload?.message || 'Paystack verification failed')
  }

  return payload
}
