import { describe, it, expect, vi, afterEach } from "vitest";
import { CircuitBreaker } from "../src/services/circuitBreaker";
import { callMockAi } from "../src/services/mockAiClient";
import { SERVICE_BUSY_MESSAGE } from "../src/services/aiGateway";

// aiGateway.ts wires up a module-level singleton breaker sized from env vars, which isn't
// convenient to control per-test. These tests exercise the same composition (breaker + mock
// client) with a locally-scoped breaker so failure thresholds/cooldowns are deterministic.
async function getAiResponseWith(
  breaker: CircuitBreaker,
  message: string,
  options: Parameters<typeof callMockAi>[1] = {}
) {
  try {
    const answer = await breaker.execute(() => callMockAi(message, options));
    return { answer, circuitOpen: false };
  } catch (err) {
    if ((err as Error).name === "CircuitOpenError") {
      return { answer: SERVICE_BUSY_MESSAGE, circuitOpen: true };
    }
    throw err;
  }
}

describe("aiGateway composition (breaker + mock AI client)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Service Busy fallback instantly after 3 consecutive failures", async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 });

    for (let i = 0; i < 3; i++) {
      const p = getAiResponseWith(breaker, "hi", { forceFail: true, delayMs: 2000 });
      const assertion = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;
    }

    // 4th call: breaker is OPEN, should resolve to the fallback with no delay needed.
    const fallback = await getAiResponseWith(breaker, "hi", { forceFail: true, delayMs: 2000 });
    expect(fallback).toEqual({ answer: SERVICE_BUSY_MESSAGE, circuitOpen: true });
  });
});
