import { describe, it, expect } from "vitest";
import { sanitizeMessage } from "../src/services/sanitizer";

describe("sanitizeMessage", () => {
  it("leaves a message with no PII unchanged", () => {
    expect(sanitizeMessage("Hello, how are you today?")).toBe("Hello, how are you today?");
  });

  it("redacts a single email", () => {
    expect(sanitizeMessage("Contact me at jane.doe@example.com please")).toBe(
      "Contact me at <REDACTED: EMAIL> please"
    );
  });

  it("redacts multiple emails", () => {
    expect(sanitizeMessage("a@b.com and c@d.org")).toBe(
      "<REDACTED: EMAIL> and <REDACTED: EMAIL>"
    );
  });

  it("redacts a Luhn-valid credit card with no separators", () => {
    expect(sanitizeMessage("Card: 4111111111111111")).toBe("Card: <REDACTED: CREDIT_CARD>");
  });

  it("redacts a Luhn-valid credit card with dashes", () => {
    expect(sanitizeMessage("Card: 4111-1111-1111-1111")).toBe("Card: <REDACTED: CREDIT_CARD>");
  });

  it("redacts a Luhn-valid credit card with spaces", () => {
    expect(sanitizeMessage("Card: 4111 1111 1111 1111")).toBe("Card: <REDACTED: CREDIT_CARD>");
  });

  it("redacts a Luhn-valid 15-digit Amex-style card", () => {
    expect(sanitizeMessage("Amex 378282246310005 on file")).toBe(
      "Amex <REDACTED: CREDIT_CARD> on file"
    );
  });

  it("does not redact a 16-digit number that fails the Luhn check", () => {
    expect(sanitizeMessage("Ref number 1234567890123456")).toBe(
      "Ref number 1234567890123456"
    );
  });

  it("redacts a formatted SSN", () => {
    expect(sanitizeMessage("SSN: 123-45-6789")).toBe("SSN: <REDACTED: SSN>");
  });

  it("redacts a bare 9-digit SSN", () => {
    expect(sanitizeMessage("SSN is 123456789 on file")).toBe(
      "SSN is <REDACTED: SSN> on file"
    );
  });

  it("does not redact a bare 10-digit phone number as an SSN", () => {
    expect(sanitizeMessage("Call 5551234567 now")).toBe("Call 5551234567 now");
  });

  it("redacts a mix of email, credit card, and SSN in one message", () => {
    const input =
      "I'm jane@example.com, my card is 4111 1111 1111 1111 and my SSN is 123-45-6789.";
    expect(sanitizeMessage(input)).toBe(
      "I'm <REDACTED: EMAIL>, my card is <REDACTED: CREDIT_CARD> and my SSN is <REDACTED: SSN>."
    );
  });
});
