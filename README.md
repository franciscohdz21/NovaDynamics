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

### Tests

`npm test` runs the Vitest suite (unit + integration tests, no e2e/browser tests).