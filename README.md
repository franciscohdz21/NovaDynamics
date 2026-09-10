# NovaDynamics

## Guardian Integration Gateway

Secure middleware service (Node.js + TypeScript + Express) built for the "Guardian Integration
Gateway" take-home exercise. It exposes `POST /secure-inquiry`, which:

1. Sanitizes PII (emails, credit cards, SSNs) out of the inbound message.
2. Calls a mock AI service (simulated 2s delay) guarded by a circuit breaker.
3. Writes an audit log entry (original message encrypted, redacted message in plaintext) to a
   JSON file.

See [`AI_ORCHESTRATION.md`](./AI_ORCHESTRATION.md) for how AI was used to design the security-critical
logic (sanitizer, circuit breaker).

### Quick start (local, no Docker)

1. `npm install`
2. Copy `.env.example` to `.env` and generate an encryption key:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. `npm run dev`
4. Server listens on `http://localhost:3000` (`GET /health` for a smoke check).

### Quick start (Docker Desktop)

1. Copy `.env.example` to `.env` and fill in `AUDIT_LOG_ENCRYPTION_KEY` (see above).
2. `docker compose up --build`
3. Server is available at `http://localhost:3000`. Audit log entries persist to `./data/audit-log.json`
   on the host via the mounted volume.
4. `docker compose down` to stop and remove the container.

### API

**`POST /secure-inquiry`**

Request body:

```json
{ "userId": "user-123", "message": "Email me at jane@example.com, card 4111 1111 1111 1111" }
```

Success response (`200`):

```json
{
  "answer": "Generated Answer for inquiry: \"Email me at <REDACTED: EMAIL>, card <REDACTED: CREDIT_CARD>\"",
  "redactedMessage": "Email me at <REDACTED: EMAIL>, card <REDACTED: CREDIT_CARD>"
}
```

Other responses:

- `400 VALIDATION_ERROR` - `userId`/`message` missing or not a non-empty string.
- `502 AI_CALL_FAILED` - the mock AI call failed but the circuit breaker is still closed/half-open.
- `503` with `{ "answer": "Service Busy", "circuitOpen": true }` - the circuit breaker is open; no
  mock AI call is attempted and the response returns instantly instead of waiting on the 2s delay.

Every call (success or failure) writes an audit log entry: the original message is AES-256-GCM
encrypted, the redacted message is stored in plaintext.

### Demoing the circuit breaker

Two request headers exist purely to make the breaker demonstrable on demand instead of relying on
random failures - they never affect sanitization or the audit log:

- `x-mock-ai-force-fail: true` - force this call's mock AI response to fail.
- `x-mock-ai-delay-ms: <n>` - override the simulated AI call delay (default 2000ms).

Send 3 requests with `x-mock-ai-force-fail: true` in a row, then a 4th normal request - the 4th
comes back instantly with `{"answer":"Service Busy","circuitOpen":true}` instead of waiting on the
delay, because the breaker is open. After `CIRCUIT_BREAKER_COOLDOWN_MS` elapses, the next call is
allowed through as a half-open trial.

### Full demo walkthrough (Docker Desktop, PowerShell)

```powershell
Copy-Item .env.example .env
```
Creates your local `.env` from the template.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Generates a 32-byte hex key. Paste it into `AUDIT_LOG_ENCRYPTION_KEY=` in `.env`.

```powershell
docker compose up --build
```
Builds the image and starts the container, listening on `http://localhost:3000`.

```powershell
Invoke-RestMethod -Uri http://localhost:3000/secure-inquiry -Method Post -ContentType "application/json" -Body (@{ userId = "demo"; message = "email me at jane@example.com, card 4111 1111 1111 1111" } | ConvertTo-Json)
```
Normal request - confirms the email and card number are redacted before the mock AI "sees" them.

```powershell
1..3 | ForEach-Object { try { Invoke-RestMethod -Uri http://localhost:3000/secure-inquiry -Method Post -ContentType "application/json" -Headers @{ "x-mock-ai-force-fail" = "true" } -Body (@{ userId = "demo"; message = "hi" } | ConvertTo-Json) } catch { "Failed as expected" } }
```
Forces 3 consecutive mock AI failures (`502` each), tripping the circuit breaker open.

```powershell
Invoke-RestMethod -Uri http://localhost:3000/secure-inquiry -Method Post -ContentType "application/json" -Body (@{ userId = "demo"; message = "hi again" } | ConvertTo-Json)
```
Breaker is open - returns `503 { "answer": "Service Busy", "circuitOpen": true }` instantly, with no 2s wait. (PowerShell 5.1 surfaces non-2xx responses as an exception; the JSON body is shown in the error text.)

```powershell
Get-Content data/audit-log.json
```
Shows every call logged so far - encrypted original message plus plaintext redacted message for each entry, including the failed/fallback ones.

```powershell
docker compose down
```
Stops and removes the container.

### Tests

`npm test` runs the Vitest suite (unit + integration tests, no e2e/browser tests). CI runs this
automatically on every push to `main` via `.github/workflows/ci.yml`.

### Test coverage

35 tests across 8 files:

- **`sanitizer.test.ts`** (12) - email/credit card/SSN redaction, Luhn validation (valid cards
  redacted, invalid ones left alone), formatted vs. bare SSNs, a bare 10-digit phone number *not*
  mistaken for an SSN, and a message combining all three PII types.
- **`circuitBreaker.test.ts`** (5) - CLOSED → OPEN after N consecutive failures, instant rejection
  while open (underlying call never invoked), HALF_OPEN trial after cooldown closing on success,
  and re-opening if the trial call also fails. Uses fake timers so cooldowns run instantly.
- **`mockAiClient.test.ts`** (3) - resolves after the simulated delay, doesn't resolve early, and
  rejects deterministically via `forceFail`.
- **`aiGateway.test.ts`** (1) - breaker + mock client composition returns the `Service Busy`
  fallback once open.
- **`encryption.test.ts`** (5) - AES-256-GCM round-trip, random IV per call, and failures on a
  bad key length, wrong key, or malformed payload.
- **`auditLog.test.ts`** (3) - encrypted original + plaintext redacted fields persist correctly,
  10 concurrent `append()` calls don't drop entries, and a missing file reads back as empty.
- **`secureInquiry.test.ts`** (5) - integration tests through the real Express app: validation
  errors, a full sanitize → mock AI → audit log happy path, a genuine AI failure (`502`), and
  tripping the breaker end-to-end to confirm the instant `Service Busy` fallback.
- **`health.test.ts`** (1) - smoke test for `GET /health`.

Not covered by design: no e2e/browser tests (per project convention, reserved for critical prod
flows), and no test asserts on `Math.random()`-based failure rates - all failure-path tests use
the deterministic `forceFail`/`x-mock-ai-force-fail` override instead.
