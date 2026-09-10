import { CircuitBreaker, CircuitBreakerOptions, CircuitOpenError } from "./circuitBreaker";
import { callMockAi, MockAiOptions } from "./mockAiClient";
import { env } from "../config/env";

export const SERVICE_BUSY_MESSAGE = "Service Busy";

export interface AiGatewayResult {
  answer: string;
  /** True if the circuit breaker short-circuited the call (no mock AI call was attempted). */
  circuitOpen: boolean;
}

/**
 * Builds an AI gateway: a mock AI client call guarded by its own circuit breaker instance. This
 * is a factory (rather than a module-level singleton) so each Express app instance - and each
 * test - gets an independently-stateful breaker.
 */
export function createAiGateway(options?: Partial<CircuitBreakerOptions>) {
  const breaker = new CircuitBreaker({
    failureThreshold: options?.failureThreshold ?? env.circuitBreakerFailureThreshold,
    cooldownMs: options?.cooldownMs ?? env.circuitBreakerCooldownMs,
  });

  async function getAiResponse(
    message: string,
    callOptions?: MockAiOptions
  ): Promise<AiGatewayResult> {
    try {
      const answer = await breaker.execute(() => callMockAi(message, callOptions));
      return { answer, circuitOpen: false };
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        return { answer: SERVICE_BUSY_MESSAGE, circuitOpen: true };
      }
      throw err;
    }
  }

  return { getAiResponse, breaker };
}

export type AiGateway = ReturnType<typeof createAiGateway>;

