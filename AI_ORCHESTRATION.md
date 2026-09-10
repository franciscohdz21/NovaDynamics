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

## Phase 3 - Mock AI client + Circuit Breaker

- **`src/services/circuitBreaker.ts`**: a generic CLOSED/OPEN/HALF_OPEN breaker (`execute<T>(fn)`)
  decoupled from the mock AI call itself, so it's independently testable and reusable if a real
  AI provider replaces the mock later.
  - Opens after `failureThreshold` *consecutive* failures (resets to 0 on any success).
  - While OPEN, calls fail instantly with `CircuitOpenError` - the underlying `fn` is never
    invoked, satisfying the "instantly return... without waiting for the timeout" requirement.
  - After `cooldownMs`, the next call transitions to HALF_OPEN and allows exactly one trial call
    through (guarded by an in-flight flag so concurrent requests during the trial don't all hit
    the flaky dependency); success closes the breaker, failure re-opens it with a fresh cooldown.
- **`src/services/mockAiClient.ts`**: wraps a `setTimeout`-based 2s delay per the spec. Failures
  are controllable two ways so the breaker is actually demonstrable rather than relying on random
  chance: `MOCK_AI_FAILURE_RATE` env var (probabilistic) and a `forceFail` option (deterministic,
  used directly in tests and available for a demo/manual-trigger path later).
- **`src/services/aiGateway.ts`**: composes the two - on `CircuitOpenError` it returns the
  `"Service Busy"` fallback string instead of throwing, which is what the Phase 5 endpoint will
  surface to the client. Genuine mock AI failures (breaker still closed/half-open) propagate up
  so the endpoint can decide how to respond to those separately from a fully-open breaker.
- **Testing approach**: circuit breaker and mock AI client tests use Vitest fake timers so the
  2s delay and cooldown windows execute instantly and deterministically instead of a real
  test run taking many seconds. One gotcha worth recording: `expect(promise).rejects...` must be
  attached to the promise *before* `vi.advanceTimersByTimeAsync()` is awaited, otherwise the
  promise can reject before a rejection handler is attached, producing spurious
  "unhandled rejection" warnings even though the test itself passes.

## Phase 4 - Encrypted audit log

- **`src/services/encryption.ts`**: AES-256-GCM with a random 12-byte IV per call (the recommended
  nonce size for GCM) and the auth tag stored alongside the ciphertext, so tampering with the
  stored payload is detectable at decrypt time. The key is passed as an explicit parameter
  (defaulting to the env var) rather than only read from env internally - this was a deliberate
  testability choice: tests can pass a fixed key without fighting module-load-time env caching.
- **`src/services/auditLog.ts`**: `AuditLogStore` appends `{ id, timestamp, userId,
  encryptedOriginalMessage, redactedMessage }` records to a JSON array file. Two things this
  needed that a naive "just write the file" version wouldn't handle correctly:
  - **Concurrent writes**: an in-process promise queue serializes every read-modify-write cycle,
    so parallel `/secure-inquiry` requests can't race each other and drop entries. Verified with a
    test that fires 10 concurrent `append()` calls and asserts all 10 land in the file.
  - **Crash safety**: writes go to a temp file first, then `fs.rename()` into place, so a crash
    mid-write can't leave a half-written/corrupt JSON file behind.
- The original message is only ever persisted in its encrypted form; the redacted message is
  persisted in plaintext, matching the spec exactly.

## Phase 5 - Wiring `POST /secure-inquiry` end-to-end

- **Sanitize-before-send discipline**: the route sends the *sanitized* message to the mock AI
  client and to the audit log's plaintext field - never the raw message - so no PII leaves the
  sanitizer boundary. Only the encrypted audit log field ever holds the original text.
- **Refactored `aiGateway.ts` from a module-level singleton to a `createAiGateway()` factory.**
  This was a deliberate correction from Phase 3: a singleton circuit breaker shared across every
  request (and every test) makes it impossible to test breaker-trip behavior in isolation without
  test-only reset hooks polluting production code. A factory lets `createApp()` build one
  long-lived breaker per running process (the correct production shape) while each test builds
  its own via `createApp({ aiGateway: createAiGateway(...) })`.
- **Full dependency injection over env-var test hacks**: `createApp(options)` accepts an optional
  `auditLogStore` and `aiGateway`. Integration tests inject a store pointed at a temp file with a
  fixed test encryption key, instead of mutating `process.env` before imports (which is fragile
  with ES module hoisting) or reaching into a shared singleton's on-disk file.
- **Demo/grading headers** (`x-mock-ai-force-fail`, `x-mock-ai-delay-ms`): the exercise explicitly
  asks to demonstrate breaker orchestration, so these headers let a grader trigger 3 consecutive
  failures and observe the instant "Service Busy" fallback without waiting on random chance or
  the real 2s delay. They only affect the mock AI simulation - sanitization and audit logging are
  identical regardless of these headers, so there is no way to use them to bypass any actual
  security logic.
- **Response shape decisions**: `400 VALIDATION_ERROR` for a malformed body, `502 AI_CALL_FAILED`
  when the mock AI call genuinely fails while the breaker is still closed/half-open, `503` with
  `{ answer: "Service Busy", circuitOpen: true }` when the breaker is open. The audit log entry is
  written in both the success and failure paths (an inquiry was still made), only skipped for
  `400` validation failures since there is no valid inquiry to record.
- Verified end-to-end manually (not just via the test suite): built the project, ran the compiled
  server, and posted a real request containing an email and a credit card number - confirmed the
  response and the resulting `data/audit-log.json` entry match expectations (redacted plaintext +
  decryptable ciphertext of the original).




