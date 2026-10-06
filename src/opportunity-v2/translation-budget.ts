export interface TranslationRequestTicket {
  requestStarted(): void;
  finish(): void;
}

/** Reserves worst-case attempts before work starts, then releases unused retries. */
export class TranslationRequestBudget {
  private actualRequests = 0;
  private reservedRequests = 0;

  constructor(readonly maxRequests: number) {
    if (!Number.isInteger(maxRequests) || maxRequests < 0) throw new Error("maxRequests must be a non-negative integer");
  }

  reserve(maxAttempts: number): TranslationRequestTicket | null {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) throw new Error("each translation may reserve 1 or 2 attempts");
    if (this.actualRequests + this.reservedRequests + maxAttempts > this.maxRequests) return null;
    this.reservedRequests += maxAttempts;
    let attempts = 0;
    let finished = false;
    return {
      requestStarted: () => {
        if (finished || attempts >= maxAttempts) throw new Error("translation request reservation exceeded");
        attempts += 1;
        this.reservedRequests -= 1;
        this.actualRequests += 1;
      },
      finish: () => {
        if (finished) return;
        finished = true;
        this.reservedRequests -= maxAttempts - attempts;
      },
    };
  }

  summary(): { max_requests: number; actual_requests: number; reserved_requests: number } {
    return { max_requests: this.maxRequests, actual_requests: this.actualRequests, reserved_requests: this.reservedRequests };
  }
}
