import type { Hono } from "hono";
import type { Gateway } from "@agentify/gateway";

/**
 * Hono mount: proxy every request into the gateway's own Hono app. Because
 * both sides are Web-Standard Hono apps, this is a clean pass-through that
 * preserves raw bodies (webhook signatures stay verifiable).
 */
export function mountHono(parent: Hono, gateway: Gateway): void {
  parent.all("*", (c) => gateway.app.fetch(c.req.raw));
}
