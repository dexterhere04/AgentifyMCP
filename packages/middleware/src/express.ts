import { createRequire } from "node:module";
import type { Express, NextFunction, Request, Response, Router } from "express";
import type { Gateway } from "@agentify/gateway";
import { serveGatewayNode } from "./http-bridge.js";

/**
 * Express mount. Mount the whole agent surface on any Express app.
 *
 * NOTE: register BEFORE body parsers (or exclude `/mcp` and
 * `/webhooks/razorpay`), because webhook HMACs must be computed over the raw
 * body. Example:
 *
 *   import express from "express";
 *   import { mountExpress } from "@agentify/middleware/express";
 *   const app = express();
 *   mountExpress(app, gateway);
 */
export function expressRouter(gateway: Gateway): Router {
  const express = lazyExpress();
  const router = express.Router();
  router.use((req: Request, res: Response, next: NextFunction) => {
    void serveGatewayNode(gateway, req, res).then(
      () => undefined,
      (err) => next(err),
    );
  });
  return router;
}

export function mountExpress(app: Express, gateway: Gateway, prefix = "/"): void {
  app.use(prefix, expressRouter(gateway));
}

const require = createRequire(import.meta.url);
let cachedExpress: typeof import("express") | undefined;
function lazyExpress(): typeof import("express") {
  if (!cachedExpress) {
    cachedExpress = require("express") as typeof import("express");
  }
  return cachedExpress;
}

export type { Express as ExpressApp } from "express";
