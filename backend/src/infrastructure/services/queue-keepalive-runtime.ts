export interface KeepAliveMetrics {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly lastSuccessTime: number | null;
  readonly lastFailureTime: number | null;
  readonly consecutiveFailures: number;
}

/** Mutable runtime state kept outside the queue and HTTP adapters. */
export class QueueKeepAliveRuntime {
  public keepAliveInterval: NodeJS.Timeout | null = null;
  public checkJobsInterval: NodeJS.Timeout | null = null;
  public lastJobActivityTime = Date.now();
  public isEnabled = false;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private lastSuccessTime: number | null = null;
  private lastFailureTime: number | null = null;
  private consecutiveFailures = 0;

  public recordJobActivity(): void {
    this.lastJobActivityTime = Date.now();
  }

  public recordRequest(): void {
    this.totalRequests += 1;
  }

  public recordSuccess(): void {
    this.successfulRequests += 1;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;
  }

  public recordFailure(): void {
    this.failedRequests += 1;
    this.lastFailureTime = Date.now();
    this.consecutiveFailures += 1;
  }

  public getMetrics(): KeepAliveMetrics {
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      lastSuccessTime: this.lastSuccessTime,
      lastFailureTime: this.lastFailureTime,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  public resetMetrics(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.lastSuccessTime = null;
    this.lastFailureTime = null;
    this.consecutiveFailures = 0;
  }
}
