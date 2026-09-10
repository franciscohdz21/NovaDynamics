import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, CircuitOpenError, CircuitState } from "../src/services/circuitBreaker";

function failingCall(): Promise<string> {
  return Promise.reject(new Error("boom"));
}

function succeedingCall(): Promise<string> {
  return Promise.resolve("ok");
}

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts CLOSED and stays CLOSED on success", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    await expect(breaker.execute(succeedingCall)).resolves.toBe("ok");
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("opens after 3 consecutive failures", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });

    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it("instantly rejects with CircuitOpenError once open, without invoking the call", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 5000 });
    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    const spy = vi.fn(succeedingCall);
    await expect(breaker.execute(spy)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("allows a half-open trial after the cooldown, closing on success", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    vi.advanceTimersByTime(1000);

    await expect(breaker.execute(succeedingCall)).resolves.toBe("ok");
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("re-opens if the half-open trial call also fails", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    vi.advanceTimersByTime(1000);

    await expect(breaker.execute(failingCall)).rejects.toThrow("boom");
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Still within the new cooldown window - should short-circuit again.
    await expect(breaker.execute(succeedingCall)).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
