import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://sandbox-api.paynodo.com";

export function loadDotEnv(filePath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function readPem(valueOrPath) {
  if (!valueOrPath) {
    throw new Error("Missing PEM value or path");
  }

  if (valueOrPath.includes("-----BEGIN")) {
    return valueOrPath.replace(/\\n/g, "\n");
  }

  return fs.readFileSync(path.resolve(process.cwd(), valueOrPath), "utf8");
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function minifyJson(payload) {
  const value = typeof payload === "string" ? JSON.parse(payload) : payload;
  return JSON.stringify(value ?? {});
}

export function buildStringToSign(timestamp, merchantSecret, payload) {
  return [timestamp, merchantSecret, minifyJson(payload)].join("|");
}

export function signPayload({ timestamp, merchantSecret, payload, privateKeyPem }) {
  const stringToSign = buildStringToSign(timestamp, merchantSecret, payload);
  const signature = crypto.sign("RSA-SHA256", Buffer.from(stringToSign), privateKeyPem).toString("base64");
  return { signature, stringToSign, body: minifyJson(payload) };
}

export function signedHeaders({ merchantId, timestamp, merchantSecret, payload, privateKeyPem }) {
  const { signature, stringToSign, body } = signPayload({
    timestamp,
    merchantSecret,
    payload,
    privateKeyPem
  });

  return {
    headers: {
      "Content-Type": "application/json",
      "X-PARTNER-ID": merchantId,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": signature
    },
    body,
    stringToSign
  };
}

export function verifyCallback({ rawBody, timestamp, signature, platformPublicKeyPem }) {
  const body = minifyJson(rawBody);
  const stringToVerify = [timestamp, body].join("|");
  return crypto.verify(
    "RSA-SHA256",
    Buffer.from(stringToVerify),
    platformPublicKeyPem,
    Buffer.from(signature, "base64")
  );
}

export class PayNodoClient {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    merchantId,
    merchantSecret,
    privateKeyPem,
    fetchImpl = globalThis.fetch,
    now = () => new Date().toISOString()
  }) {
    if (!merchantId) throw new Error("merchantId is required");
    if (!merchantSecret) throw new Error("merchantSecret is required");
    if (!privateKeyPem) throw new Error("privateKeyPem is required");
    if (!fetchImpl) throw new Error("fetch implementation is required");

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.merchantId = merchantId;
    this.merchantSecret = merchantSecret;
    this.privateKeyPem = privateKeyPem;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async request(method, endpoint, payload = {}) {
    const timestamp = this.now();
    const signaturePayload = method.toUpperCase() === "GET" ? {} : payload;
    const { headers, body } = signedHeaders({
      merchantId: this.merchantId,
      timestamp,
      merchantSecret: this.merchantSecret,
      payload: signaturePayload,
      privateKeyPem: this.privateKeyPem
    });

    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: method.toUpperCase() === "GET" ? undefined : body
    });

    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data
    };
  }

  createPayIn(payload) {
    return this.request("POST", "/v2.0/transaction/pay-in", payload);
  }

  createPayOut(payload) {
    return this.request("POST", "/v2.0/disbursement/pay-out", payload);
  }

  inquiryStatus(payload) {
    return this.request("POST", "/v2.0/inquiry-status", payload);
  }

  inquiryBalance(payload) {
    return this.request("POST", "/v2.0/inquiry-balance", payload);
  }

  paymentMethods() {
    return this.request("GET", "/v2.0/payment-methods", {});
  }
}
