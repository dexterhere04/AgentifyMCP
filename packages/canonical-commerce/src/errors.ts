/**
 * Canonical error codes shared by every adapter and the gateway.
 *
 * These are deliberately backend-agnostic: an adapter must translate a
 * merchant's HTTP 500 / timeout / 404 into one of these codes so that
 * UCP/MCP layers never depend on merchant-specific semantics.
 */
export type ProviderErrorCode =
  | "BACKEND_ERROR"
  | "BACKEND_TIMEOUT"
  | "BACKEND_UNAUTHORIZED"
  | "NOT_FOUND"
  | "MALFORMED_RECORD"
  | "INVALID_ARGUMENT"
  | "RATE_LIMITED"
  | "UNSUPPORTED_CAPABILITY"
  | "PRICE_CHANGED"
  | "INTERNAL";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ProviderErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.details = details;
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}

export function notFound(resource: string, id: string): ProviderError {
  return new ProviderError("NOT_FOUND", `${resource} "${id}" not found`, { resource, id });
}

export function invalidArgument(message: string, details?: Record<string, unknown>): ProviderError {
  return new ProviderError("INVALID_ARGUMENT", message, details);
}

export function backendError(message: string, details?: Record<string, unknown>): ProviderError {
  return new ProviderError("BACKEND_ERROR", message, details);
}

export function backendTimeout(message = "merchant backend timed out"): ProviderError {
  return new ProviderError("BACKEND_TIMEOUT", message);
}

export function malformedRecord(
  resource: string,
  id: string,
  reason: string,
): ProviderError {
  return new ProviderError("MALFORMED_RECORD", `malformed ${resource} record "${id}": ${reason}`, {
    resource,
    id,
    reason,
  });
}

export function unsupportedCapability(feature: string): ProviderError {
  return new ProviderError(
    "UNSUPPORTED_CAPABILITY",
    `merchant does not support ${feature}`,
    { feature },
  );
}

export function rateLimited(message = "rate limit exceeded"): ProviderError {
  return new ProviderError("RATE_LIMITED", message);
}

/** Live price no longer matches the quoted/approved amount — require re-approval. */
export function priceChanged(message: string, details?: Record<string, unknown>): ProviderError {
  return new ProviderError("PRICE_CHANGED", message, details);
}

/** HTTP status that best represents a provider error, used by the gateway. */
export function providerErrorStatus(err: ProviderError): number {
  switch (err.code) {
    case "NOT_FOUND":
      return 404;
    case "INVALID_ARGUMENT":
      return 400;
    case "PRICE_CHANGED":
      return 409;
    case "BACKEND_UNAUTHORIZED":
      return 502;
    case "RATE_LIMITED":
      return 429;
    case "UNSUPPORTED_CAPABILITY":
      return 501;
    default:
      return 502;
  }
}
