import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../src/services/encryption";

const TEST_KEY = "0".repeat(64); // 32 zero bytes - valid length for AES-256-GCM

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext message", () => {
    const plaintext = "sensitive original message with a card 4111111111111111";
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(encrypted).not.toContain(plaintext);
    expect(decrypt(encrypted, TEST_KEY)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const plaintext = "same message";
    expect(encrypt(plaintext, TEST_KEY)).not.toBe(encrypt(plaintext, TEST_KEY));
  });

  it("throws when the key is not 32 bytes", () => {
    expect(() => encrypt("hello", "abc123")).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const otherKey = "1".repeat(64);
    const encrypted = encrypt("hello", TEST_KEY);
    expect(() => decrypt(encrypted, otherKey)).toThrow();
  });

  it("throws on a malformed payload", () => {
    expect(() => decrypt("not-a-valid-payload", TEST_KEY)).toThrow();
  });
});
