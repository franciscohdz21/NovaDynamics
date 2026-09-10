import crypto from "crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function toKeyBuffer(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "AUDIT_LOG_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256-GCM"
    );
  }
  return key;
}

/**
 * Encrypts plaintext with AES-256-GCM. Output is `iv.authTag.ciphertext`, each base64-encoded,
 * so the whole payload can be stored as a single JSON string field.
 */
export function encrypt(plaintext: string, keyHex: string = env.auditLogEncryptionKey): string {
  const key = toKeyBuffer(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    "."
  );
}

export function decrypt(payload: string, keyHex: string = env.auditLogEncryptionKey): string {
  const key = toKeyBuffer(keyHex);
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
