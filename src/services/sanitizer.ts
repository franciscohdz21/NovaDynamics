const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;

// Candidate digit runs of 13-19 digits, allowing space/dash separators (e.g. "4111 1111 1111 1111").
const CREDIT_CARD_CANDIDATE_REGEX = /\b\d(?:[ -]?\d){12,18}\b/g;

const SSN_FORMATTED_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
// Bare 9-digit run, not adjacent to other digits (avoids matching into e.g. a 10-digit phone number).
const SSN_BARE_REGEX = /(?<!\d)\d{9}(?!\d)/g;

/**
 * Luhn checksum, used to avoid flagging arbitrary 13-19 digit numbers as credit cards.
 */
function isValidLuhn(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function redactEmails(text: string): string {
  return text.replace(EMAIL_REGEX, "<REDACTED: EMAIL>");
}

function redactCreditCards(text: string): string {
  return text.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
    const digitsOnly = match.replace(/[ -]/g, "");
    if (digitsOnly.length < 13 || digitsOnly.length > 19) return match;
    return isValidLuhn(digitsOnly) ? "<REDACTED: CREDIT_CARD>" : match;
  });
}

function redactSSNs(text: string): string {
  return text
    .replace(SSN_FORMATTED_REGEX, "<REDACTED: SSN>")
    .replace(SSN_BARE_REGEX, "<REDACTED: SSN>");
}

/**
 * Strips emails, credit card numbers, and SSNs from a message, replacing each with
 * `<REDACTED: TYPE>`. Order matters: emails first, then credit cards (so a valid card number's
 * digits are consumed before the SSN pass can mistake a 9-digit substring within it), then SSNs.
 */
export function sanitizeMessage(message: string): string {
  let result = message;
  result = redactEmails(result);
  result = redactCreditCards(result);
  result = redactSSNs(result);
  return result;
}
