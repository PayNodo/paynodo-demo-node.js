import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BASE_URL,
  PayNodoClient,
  loadDotEnv,
  readPem,
  signedHeaders,
  verifyCallback
} from "./paynodo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadDotEnv(path.resolve(rootDir, ".env"));

const command = process.argv[2] ?? "sign-payin";
const merchantId = process.env.PAYNODO_MERCHANT_ID ?? "replace_with_merchant_id";
const merchantSecret = process.env.PAYNODO_MERCHANT_SECRET ?? "replace_with_merchant_secret";

const payIn = payInPayload(merchantId);
const payOut = payOutPayload(merchantId);
const status = statusPayload();
const balance = balancePayload();

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

if (command === "verify-callback") {
  const platformPublicKeyPem = readPem(
    process.env.PAYNODO_PLATFORM_PUBLIC_KEY_PEM ??
      process.env.PAYNODO_PLATFORM_PUBLIC_KEY_PATH ??
      path.resolve(rootDir, "paynodo-public-key.pem")
  );
  print({
    valid: verifyCallback({
      rawBody: requiredEnv("PAYNODO_CALLBACK_BODY"),
      timestamp: requiredEnv("PAYNODO_CALLBACK_TIMESTAMP"),
      signature: requiredEnv("PAYNODO_CALLBACK_SIGNATURE"),
      platformPublicKeyPem
    })
  });
  process.exit(0);
}

const privateKeyPem = readPem(
  process.env.PAYNODO_PRIVATE_KEY_PEM ??
    process.env.PAYNODO_PRIVATE_KEY_PATH ??
    path.resolve(rootDir, "merchant-private-key.pem")
);

if (command === "sign-payin") {
  const timestamp = process.env.PAYNODO_TIMESTAMP ?? new Date().toISOString();
  print(signedHeaders({ merchantId, timestamp, merchantSecret, payload: payIn, privateKeyPem }));
  process.exit(0);
}

const client = new PayNodoClient({
  baseUrl: process.env.PAYNODO_BASE_URL ?? DEFAULT_BASE_URL,
  merchantId,
  merchantSecret,
  privateKeyPem
});

const commands = {
  payin: () => client.createPayIn(payIn),
  payout: () => client.createPayOut(payOut),
  status: () => client.inquiryStatus(status),
  balance: () => client.inquiryBalance({
    ...balance,
    accountNo: process.env.PAYNODO_ACCOUNT_NO ?? balance.accountNo
  }),
  methods: () => client.paymentMethods()
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  console.error("Use one of: sign-payin, verify-callback, payin, payout, status, balance, methods");
  process.exit(1);
}

print(await commands[command]());

function payInPayload(merchantId) {
  return {
    orderNo: process.env.PAYNODO_PAYIN_ORDER_NO ?? "ORDPI2026000001",
    purpose: process.env.PAYNODO_PAYIN_PURPOSE ?? "customer payment",
    merchant: {
      merchantId,
      merchantName: process.env.PAYNODO_MERCHANT_NAME ?? "Integrated Merchant"
    },
    money: {
      currency: "BRL",
      amount: Number(process.env.PAYNODO_PAYIN_AMOUNT ?? 12000)
    },
    payer: {
      pixAccount: process.env.PAYNODO_PAYER_PIX_ACCOUNT ?? "48982488880"
    },
    paymentMethod: process.env.PAYNODO_PAYIN_METHOD ?? "PIX",
    expiryPeriod: Number(process.env.PAYNODO_EXPIRY_PERIOD ?? 3600),
    redirectUrl: process.env.PAYNODO_REDIRECT_URL ?? "https://merchant.example/return",
    callbackUrl: process.env.PAYNODO_CALLBACK_URL ?? "https://merchant.example/webhooks/paynodo"
  };
}

function payOutPayload(merchantId) {
  return {
    additionalParam: {},
    cashAccount: process.env.PAYNODO_PAYOUT_CASH_ACCOUNT ?? "12532481501",
    receiver: {
      taxNumber: process.env.PAYNODO_RECEIVER_TAX_NUMBER ?? "12345678909",
      accountName: process.env.PAYNODO_RECEIVER_NAME ?? "Betty"
    },
    merchant: {
      merchantId
    },
    money: {
      amount: Number(process.env.PAYNODO_PAYOUT_AMOUNT ?? 10000),
      currency: "BRL"
    },
    orderNo: process.env.PAYNODO_PAYOUT_ORDER_NO ?? "ORDPO2026000001",
    paymentMethod: process.env.PAYNODO_PAYOUT_METHOD ?? "CPF",
    purpose: process.env.PAYNODO_PAYOUT_PURPOSE ?? "Purpose For Disbursement from API",
    callbackUrl: process.env.PAYNODO_CALLBACK_URL ?? "https://merchant.example/webhooks/paynodo"
  };
}

function statusPayload() {
  return {
    tradeType: Number(process.env.PAYNODO_STATUS_TRADE_TYPE ?? 1),
    orderNo: process.env.PAYNODO_STATUS_ORDER_NO ?? process.env.PAYNODO_PAYIN_ORDER_NO ?? "ORDPI2026000001"
  };
}

function balancePayload() {
  return {
    accountNo: process.env.PAYNODO_ACCOUNT_NO ?? "YOUR_ACCOUNT_NO",
    balanceTypes: ["BALANCE"]
  };
}

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
  return process.env[name];
}
