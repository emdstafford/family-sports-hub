import { createECDH, createHash } from "crypto";
import webpush from "web-push";

function base64Url(value: Buffer) {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function getVapidKeys() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is required for notifications.");

  const privateKey = createHash("sha256").update(`fambam-web-push:${secret}`).digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey);
  return {
    privateKey: base64Url(privateKey),
    publicKey: base64Url(ecdh.getPublicKey()),
  };
}

export function configureWebPush() {
  const keys = getVapidKeys();
  webpush.setVapidDetails("mailto:notifications@fambam-sports.app", keys.publicKey, keys.privateKey);
  return webpush;
}
