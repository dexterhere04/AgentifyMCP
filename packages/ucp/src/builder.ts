import type { Capabilities } from "@gateway/canonical-commerce";
import {
  SHOPPING_SERVICE,
  UCP_VERSION,
  VERSION_PATTERN,
  type BusinessDiscoveryProfile,
  type CapabilityEntry,
  type ServiceBinding,
  type UcpProblem,
} from "./profile.js";
import { ucpCapabilityIdsFor } from "./capabilities.js";

export interface UcpProfileConfig {
  capabilities: Capabilities;
  /** Public origin of the gateway, e.g. https://demo.example (no trailing slash). */
  baseUrl: string;
  /** Path to the MCP endpoint. */
  mcpPath?: string;
  /** UCP protocol version this profile conforms to (YYYY-MM-DD). */
  version?: string;
  /** Public verification keys (RFC 7517 JWK). Optional until signing is enabled. */
  keys?: Array<{ kty: string; kid?: string; use?: string; alg?: string; crv?: string; x?: string; y?: string }>;
  /** When true, require an https baseUrl unless the host is localhost. */
  requireHttps?: boolean;
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(`UCP baseUrl must be an origin with no path; got "${baseUrl}"`);
  }
  return url.origin;
}

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

/**
 * Build the business discovery profile for a gateway instance from its
 * provider's capability graph. Transport endpoints are derived from the
 * public base URL so the document is always self-consistent.
 *
 * Throws on malformed configuration (non-HTTPS public origin, bad version,
 * unparseable base URL) so misconfiguration fails at startup rather than
 * serving an invalid discovery document.
 */
export function buildUcpProfile(config: UcpProfileConfig): BusinessDiscoveryProfile {
  const version = config.version ?? UCP_VERSION;
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid UCP version "${version}"; expected YYYY-MM-DD`);
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const parsed = new URL(baseUrl);

  if (parsed.protocol === "http:" && (config.requireHttps ?? true) && !isLocalhost(parsed)) {
    throw new Error(
      `UCP requires HTTPS for public hosts; baseUrl "${baseUrl}" is insecure. ` +
        "Use https:// or set requireHttps:false for localhost development.",
    );
  }

  const mcpEndpoint = `${baseUrl}${config.mcpPath ?? "/mcp"}`;
  const capabilityIds = ucpCapabilityIdsFor(config.capabilities);

  const services: Record<string, ServiceBinding[]> = {};
  const capabilities: Record<string, CapabilityEntry[]> = {};

  if (capabilityIds.length > 0) {
    services[SHOPPING_SERVICE] = [
      {
        version,
        transport: "mcp",
        endpoint: mcpEndpoint,
        spec: `https://ucp.dev/${version}/specification/overview/`,
      },
    ];
    for (const id of capabilityIds) {
      capabilities[id] = [{ version }];
    }
  }

  const profile: BusinessDiscoveryProfile = {
    ucp: {
      version,
      services,
      capabilities,
      payment_handlers: {},
    },
  };
  if (config.keys && config.keys.length > 0) {
    profile.keys = config.keys;
  } else {
    profile.keys = [];
  }

  return profile;
}

/**
 * Validate a UCP discovery document and check its internal consistency:
 * - the document must satisfy the UCP business-schema shape,
 * - every advertised capability must belong to an advertised service,
 * - advertised capability ids must be recognized UCP capability ids.
 *
 * Returns a list of problems (empty when valid). This is used both by the
 * gateway (defensive) and by tests for "capability mismatch should fail
 * validation".
 */
export function validateUcpProfile(profile: unknown): UcpProblem[] {
  const problems: UcpProblem[] = [];

  if (typeof profile !== "object" || profile === null) {
    return [{ code: "INVALID_SCHEMA", message: "document is not an object" }];
  }
  const root = profile as Record<string, unknown>;
  if (typeof root.ucp !== "object" || root.ucp === null) {
    return [{ code: "INVALID_SCHEMA", message: "document must contain a top-level \"ucp\" object" }];
  }
  const ucp = root.ucp as Record<string, unknown>;

  if (typeof ucp.version !== "string" || !VERSION_PATTERN.test(ucp.version)) {
    problems.push({ code: "INVALID_SCHEMA", message: "\"ucp.version\" must be YYYY-MM-DD" });
  }

  if (typeof ucp.services !== "object" || ucp.services === null) {
    problems.push({ code: "INVALID_SCHEMA", message: "\"ucp.services\" must be an object" });
  } else {
    const services = ucp.services as Record<string, unknown>;
    for (const [serviceName, bindings] of Object.entries(services)) {
      if (!Array.isArray(bindings)) {
        problems.push({ code: "INVALID_SCHEMA", message: `service "${serviceName}" must be an array` });
        continue;
      }
      for (const binding of bindings) {
        const b = binding as Record<string, unknown>;
        if (typeof b.version !== "string" || !VERSION_PATTERN.test(b.version)) {
          problems.push({
            code: "INVALID_SCHEMA",
            message: `service "${serviceName}" binding has an invalid or missing version`,
          });
        }
        if (typeof b.transport !== "string" || !["rest", "mcp", "a2a", "embedded"].includes(b.transport)) {
          problems.push({
            code: "INVALID_SCHEMA",
            message: `service "${serviceName}" binding has invalid transport`,
          });
        }
        if (typeof b.endpoint !== "string" || !/^https?:\/\//.test(b.endpoint)) {
          problems.push({
            code: "INVALID_SCHEMA",
            message: `service "${serviceName}" binding is missing an endpoint URL`,
          });
        }
      }
    }
  }

  if (typeof ucp.payment_handlers !== "object" || ucp.payment_handlers === null) {
    problems.push({
      code: "INVALID_SCHEMA",
      message: "\"ucp.payment_handlers\" must be present (may be empty)",
    });
  }

  if (ucp.capabilities !== undefined) {
    if (typeof ucp.capabilities !== "object" || ucp.capabilities === null) {
      problems.push({ code: "INVALID_SCHEMA", message: "\"ucp.capabilities\" must be an object" });
    } else {
      const caps = ucp.capabilities as Record<string, unknown>;
      const advertisedServiceKeys = new Set(
        Object.keys((ucp.services ?? {}) as Record<string, unknown>),
      );
      for (const [capabilityId, entries] of Object.entries(caps)) {
        if (!Array.isArray(entries)) {
          problems.push({ code: "INVALID_SCHEMA", message: `capability "${capabilityId}" must be an array` });
          continue;
        }
        for (const entry of entries) {
          const e = entry as Record<string, unknown>;
          if (typeof e.version !== "string" || !VERSION_PATTERN.test(e.version)) {
            problems.push({
              code: "INVALID_SCHEMA",
              message: `capability "${capabilityId}" entry has an invalid or missing version`,
            });
          }
        }
        if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/.test(capabilityId)) {
          problems.push({
            code: "INVALID_SCHEMA",
            message: `capability "${capabilityId}" is not a reverse-domain identifier`,
          });
        }
        const service = Array.from(advertisedServiceKeys)
          .sort((a, b) => b.length - a.length)
          .find((s) => capabilityId.startsWith(`${s}.`));
        if (!service) {
          problems.push({
            code: "CAPABILITY_MISMATCH",
            message: `capability "${capabilityId}" is advertised but no parent service is exposed`,
          });
        }
      }
    }
  }

  return problems;
}

export function assertValidUcpProfile(profile: unknown): asserts profile is BusinessDiscoveryProfile {
  const problems = validateUcpProfile(profile);
  if (problems.length > 0) {
    throw new Error(
      `Invalid UCP profile:\n- ${problems.map((p) => `${p.code}: ${p.message}`).join("\n- ")}`,
    );
  }
}

export function ucpCapabilitiesFor(caps: Capabilities): string[] {
  return ucpCapabilityIdsFor(caps);
}

export function serializeUcpProfile(profile: BusinessDiscoveryProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}
