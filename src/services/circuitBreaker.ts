export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitOpenError extends Error {
  constructor() {
    super("Circuit breaker is open");
    this.name = "CircuitOpenError";
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures required to trip the breaker open. */
  failureThreshold: number;
  /** How long the breaker stays open before allowing a single half-open trial call. */
  cooldownMs: number;
}

/**
 * Simple CLOSED -> OPEN -> HALF_OPEN circuit breaker. Wrap any async call with `execute()`;
 * once `failureThreshold` consecutive failures occur, further calls fail instantly with
 * `CircuitOpenError` until `cooldownMs` elapses, at which point a single trial call is allowed
 * through (HALF_OPEN) to decide whether to close or re-open the breaker.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenTrialInFlight = false;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getState(): CircuitState {
    return this.state;
  }

  private hasCooldownElapsed(): boolean {
    return Date.now() - this.openedAt >= this.options.cooldownMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (!this.hasCooldownElapsed()) {
        throw new CircuitOpenError();
      }
      this.state = CircuitState.HALF_OPEN;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenTrialInFlight) {
        throw new CircuitOpenError();
      }
      this.halfOpenTrialInFlight = true;
      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err) {
        this.onFailure();
        throw err;
      } finally {
        this.halfOpenTrialInFlight = false;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    const wasHalfOpen = this.state === CircuitState.HALF_OPEN;
    if (wasHalfOpen || this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
    }
  }
}
