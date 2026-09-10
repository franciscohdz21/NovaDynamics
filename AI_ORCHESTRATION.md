# AI Orchestration Log

This document records how AI was used to design the security-critical logic in this project, per
the exercise requirement to show how AI was orchestrated to handle security logic.

This is being built inside a GitHub Copilot Chat session running on **Claude Sonnet 5**, so the
AI usage requirement is satisfied end-to-end: every file in this repo was produced through a
prompt/response loop with Claude, not written by hand first and "AI-polished" after.

Entries are added phase by phase as the security-sensitive logic (sanitizer, circuit breaker,
encryption) is built. See later phases for the sanitizer design log and circuit breaker design log.

## Phase 1 - Scaffold

No security-critical logic yet (health check + project skeleton only). Scaffolding decisions
(Express + TS, Vitest/Supertest, Docker multi-stage build) were carried over from this workspace's
sibling project conventions rather than AI-generated from scratch.

## Phase 2 - PII Sanitizer (`src/services/sanitizer.ts`)

Design goals discussed and settled on in this session before writing code:

- **Ordering matters.** Emails are redacted first, then credit cards, then SSNs. Credit card
  numbers are redacted before the SSN pass runs so a 16-digit card number can't leave a stray
  9-digit substring behind that the SSN regex would then falsely flag.
- **Credit cards are Luhn-validated.** A naive "13-19 digit run" regex would flag any long number
  (invoice IDs, tracking numbers) as a credit card. Requiring the Luhn checksum to pass
  significantly cuts false positives while still catching real card numbers (including
  space/dash-separated formats like `4111 1111 1111 1111`). Trade-off: a real-but-mistyped card
  number that fails Luhn won't be redacted - acceptable for this exercise, called out here rather
  than silently accepted.
- **SSNs use two patterns**: the formatted `\d{3}-\d{2}-\d{4}` form, and a bare 9-digit form
  guarded with `(?<!\d)`/`(?!\d)` lookarounds so it does not match inside a 10-digit phone number
  or a longer digit run.
- **No overlap tracking data structure was needed** - because each pass runs sequentially against
  the evolving string and each earlier match is fully replaced with a non-digit placeholder before
  the next pass runs, there is nothing left for later regexes to falsely re-match.

Verified with 12 unit tests covering: no-PII passthrough, multiple emails, card numbers with no
separators/dashes/spaces, a 15-digit Amex-format card, a Luhn-invalid number staying untouched, a
formatted SSN, a bare SSN, a 10-digit phone number staying untouched, and a combined message with
all three PII types.

