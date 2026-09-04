/**
 * Types and validation model for the Universal Commerce Protocol (UCP)
 * business discovery profile served at `/.well-known/ucp`.
 *
 * Shape is derived from the authoritative spec (ucp.dev) and Google's own
 * public business/agent profile: a root document `{ "ucp": { ... }, "keys": [...] }`
 * whose `ucp` member satisfies the UCP "business_schema":
 *   - `version`        (required, YYYY-MM-DD)
 *   - `services`       (required, reverse-domain registry of transport bindings)
 *   - `capabilities`   (required, reverse-domain registry of capability entries)
 *   - `payment_handlers` (required; may be empty)
 */

export const UCP_VERSION = "2026-08-25";

export const SHOPPING_SERVICE = "dev.ucp.shopping";

export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const REVERSE_DOMAIN_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;

export type UcpTransport = "rest" | "mcp" | "a2a" | "embedded";

export interface ServiceBinding {
  version: string;
  transport: UcpTransport;
  /** Endpoint URL for this transport binding (e.g. MCP server URL). */
  endpoint: string;
  spec?: string;
  schema?: string;
  id?: string;
  config?: Record<string, unknown>;
}

export interface CapabilityEntry {
  version: string;
  spec?: string;
  schema?: string;
  id?: string;
  config?: Record<string, unknown>;
  extends?: string | string[];
}

export interface UcpMetadata {
  version: string;
  services: Record<string, ServiceBinding[]>;
  capabilities: Record<string, CapabilityEntry[]>;
  payment_handlers: Record<string, unknown[]>;
  supported_versions?: Record<string, string>;
}

export interface Jwk {
  kty: string;
  use?: string;
  alg?: string;
  kid?: string;
  crv?: string;
  x?: string;
  y?: string;
}

/** The full document served at `/.well-known/ucp`. */
export interface BusinessDiscoveryProfile {
  ucp: UcpMetadata;
  keys?: Jwk[];
}

export interface UcpProblem {
  /** Stable machine code for the problem. */
  code: "INVALID_SCHEMA" | "UNSUPPORTED_VERSION" | "MISSING_SERVICE" | "CAPABILITY_MISMATCH";
  message: string;
}
