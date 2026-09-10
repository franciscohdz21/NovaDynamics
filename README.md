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

### Tests

`npm test` runs the Vitest suite (unit + integration tests, no e2e/browser tests). CI runs this
automatically on every push to `main` via `.github/workflows/ci.yml`.
