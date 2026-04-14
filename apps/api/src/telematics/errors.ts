/**
 * Typed telematics API errors.
 * Thrown by provider clients so the orchestrator can handle error categories
 * (auth, rate-limit, server) without string-matching.
 */

export class TelematicsAuthError extends Error {
  readonly statusCode = 401;
  constructor(
    public readonly provider: 'SAMSARA' | 'MOTIVE',
    public readonly path: string,
    message?: string
  ) {
    super(
      message ??
        `${provider} API authentication failed (HTTP 401 on ${path}). ` +
          `The token may lack permission for this endpoint.`
    );
    this.name = 'TelematicsAuthError';
  }
}

export class TelematicsRateLimitError extends Error {
  readonly statusCode = 429;
  constructor(public readonly provider: 'SAMSARA' | 'MOTIVE') {
    super(`${provider} API rate limit exceeded (HTTP 429)`);
    this.name = 'TelematicsRateLimitError';
  }
}

export class TelematicsServerError extends Error {
  constructor(
    public readonly provider: 'SAMSARA' | 'MOTIVE',
    public readonly statusCode: number
  ) {
    super(`${provider} API server error (HTTP ${statusCode})`);
    this.name = 'TelematicsServerError';
  }
}

export class TelematicsTimeoutError extends Error {
  constructor(public readonly provider: 'SAMSARA' | 'MOTIVE') {
    super(`${provider} API request timeout — no response received`);
    this.name = 'TelematicsTimeoutError';
  }
}

/** Returns true for errors that are worth retrying (rate-limit, server 5xx, timeout). */
export function isTransientError(err: unknown): boolean {
  return (
    err instanceof TelematicsRateLimitError ||
    err instanceof TelematicsServerError ||
    err instanceof TelematicsTimeoutError
  );
}
