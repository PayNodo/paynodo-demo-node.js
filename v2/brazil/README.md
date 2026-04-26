# PayNodo Brazil V2 Node.js Demo

Backend-only Node.js demo for PayNodo Brazil V2.

## Requirements

- Node.js 20+

No npm dependencies are required.

## Setup

```shell
cp .env.example .env
```

Edit `.env` and replace sandbox values with the credentials from the merchant cabinet.
Save the merchant private key as `merchant-private-key.pem`, or set `PAYNODO_PRIVATE_KEY_PEM` directly in `.env`.

## Generate a signed PayIn preview

```shell
npm start -- sign-payin
```

## Send sandbox requests

```shell
npm start -- payin
npm start -- payout
npm start -- status
npm start -- balance
npm start -- methods
```

## Verify a callback signature

```shell
PAYNODO_CALLBACK_BODY='{"orderNo":"ORDPI2026000001","status":"SUCCESS"}' \
PAYNODO_CALLBACK_TIMESTAMP='2026-04-17T13:25:10.000Z' \
PAYNODO_CALLBACK_SIGNATURE='replace_with_callback_signature' \
npm start -- verify-callback
```

The private key and merchant secret must stay on the merchant backend.
