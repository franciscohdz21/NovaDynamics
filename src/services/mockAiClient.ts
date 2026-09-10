import { env } from "../config/env";

export class MockAiCallError extends Error {
  constructor() {
    super("Mock AI call failed");
    this.name = "MockAiCallError";
  }
}

export interface MockAiOptions {
  /** Force this call to fail, bypassing the random failure rate. Useful for demos/tests. */
  forceFail?: boolean;
  /** Overrides env.mockAiFailureRate for this call. */
  failureRate?: number;
  /** Overrides the simulated network delay (defaults to 2000ms per the spec). */
  delayMs?: number;
}

/**
 * Simulates an external AI call: a 2s network delay, then either a generated answer or a
 * failure (rate controlled via env/options, or forced for deterministic demos/tests).
 */
export function callMockAi(message: string, options: MockAiOptions = {}): Promise<string> {
  const delayMs = options.delayMs ?? 2000;
  const failureRate = options.failureRate ?? env.mockAiFailureRate;

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const shouldFail = options.forceFail ?? Math.random() < failureRate;
      if (shouldFail) {
        reject(new MockAiCallError());
        return;
      }
      resolve(`Generated Answer for inquiry: "${message}"`);
    }, delayMs);
  });
}
