import { CircuitBreaker, CircuitOpenError } from "./circuitBreaker";
import { callMockAi, MockAiOptions } from "./mockAiClient";
import { env } from "../config/env";

export const SERVICE_BUSY_MESSAGE = "Service Busy";

export const circuitBreaker = new CircuitBreaker({
  failureThreshold: env.circuitBreakerFailureThreshold,
  cooldownMs: env.circuitBreakerCooldownMs,
});

export interface AiGatewayResult {
  answer: string;
  /** True if the circuit breaker short-circuited the call (no mock AI call was attempted). */
  circuitOpen: boolean;
}

/**
 * Routes a message through the mock AI client, guarded by the shared circuit breaker. When the
 * breaker is open, returns the "Service Busy" fallback instantly instead of waiting on the
 * simulated 2s delay. Genuine mock AI call failures (breaker still closed/half-open) propagate
 * to the caller to handle.
 */
export async function getAiResponse(
  message: string,
  options?: MockAiOptions
): Promise<AiGatewayResult> {
  try {
    const answer = await circuitBreaker.execute(() => callMockAi(message, options));
    return { answer, circuitOpen: false };
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return { answer: SERVICE_BUSY_MESSAGE, circuitOpen: true };
    }
    throw err;
  }
}
