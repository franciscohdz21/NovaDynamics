import "dotenv/config";
import path from "path";

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: toNumber(process.env.PORT, 3000),
  auditLogEncryptionKey: process.env.AUDIT_LOG_ENCRYPTION_KEY ?? "",
  auditLogFilePath:
    process.env.AUDIT_LOG_FILE_PATH || path.join(process.cwd(), "data", "audit-log.json"),
  mockAiFailureRate: toNumber(process.env.MOCK_AI_FAILURE_RATE, 0),
  circuitBreakerFailureThreshold: toNumber(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD, 3),
  circuitBreakerCooldownMs: toNumber(process.env.CIRCUIT_BREAKER_COOLDOWN_MS, 30000),
};

