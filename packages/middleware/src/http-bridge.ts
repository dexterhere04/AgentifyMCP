import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Gateway } from "@agentify/gateway";

/**
 * Framework-agnostic bridge: serve the gateway's Hono app over raw Node
 * request/response objects. Used by the Express adapter and available to any
 * Node HTTP server.
 */

export function nodeRequestToWebRequest(req: IncomingMessage): Request {
  const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: "half" as const }
      : {}),
  });
}

export async function writeWebResponse(res: ServerResponse, web: Response): Promise<void> {
  res.writeHead(web.status, Object.fromEntries(web.headers.entries()));
  if (web.body) {
    const node = Readable.fromWeb(web.body as import("node:stream/web").ReadableStream);
    node.pipe(res);
    await new Promise<void>((resolve, reject) => {
      node.on("end", () => resolve());
      node.on("error", reject);
    });
  } else {
    res.end();
  }
}

/** Serve the whole gateway (mcp, ucp, metadata, catalog, webhooks, healthz). */
export async function serveGatewayNode(gateway: Gateway, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const web = await gateway.app.fetch(nodeRequestToWebRequest(req));
    await writeWebResponse(res, web);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.DEBUG_GATEWAY_BRIDGE) console.error("[gateway-bridge]", err);
    res.end(JSON.stringify({ error: { code: "INTERNAL", message } }));
  }
}
