import { describe, it, expect, vi, afterEach } from "vitest";
import { callMockAi, MockAiCallError } from "../src/services/mockAiClient";

describe("callMockAi", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with a generated answer after the simulated delay", async () => {
    vi.useFakeTimers();
    const promise = callMockAi("hello", { failureRate: 0, delayMs: 2000 });

    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toContain("Generated Answer");
  });

  it("does not resolve before the delay has elapsed", async () => {
    vi.useFakeTimers();
    let resolved = false;
    callMockAi("hello", { failureRate: 0, delayMs: 2000 }).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);
  });

  it("rejects with MockAiCallError when forceFail is set", async () => {
    vi.useFakeTimers();
    const promise = callMockAi("hello", { forceFail: true, delayMs: 2000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(MockAiCallError);

    await vi.advanceTimersByTimeAsync(2000);

    await assertion;
  });
});
