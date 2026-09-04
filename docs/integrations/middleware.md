# Framework middleware

Drop the entire agent surface onto your existing backend with one call.
`@agentify/middleware` mounts `/mcp`, `/.well-known/ucp`, `/agents.md`,
`/llms.txt` (and `/webhooks/razorpay` when a payment gateway is wired) onto the
framework you already run.

## Express

```ts
import express from "express";
import { createGateway } from "@agentify/gateway";
import { mountExpress } from "@agentify/middleware/express";

const gateway = await createGateway({ provider });
const app = express();
mountExpress(app, gateway);   // app.use("/", router) — whole surface
app.listen(3000);
```

> Register the mount BEFORE body parsers (or exclude `/mcp` and
> `/webhooks/*`), because webhook HMAC signatures must be computed over the raw
> body.

## Hono

```ts
import { Hono } from "hono";
import { mountHono } from "@agentify/middleware/hono";
const app = new Hono();
mountHono(app, gateway);   // proxies c.req.raw -> gateway.app.fetch
```

## Node HTTP / anything else

```ts
import { serveGatewayNode } from "@agentify/middleware"; // raw http(req, res)
```

Fastify and Next.js can use the same Node/Web bridges: Next route handlers can
return `gateway.app.fetch(request)` directly (Web Request → Response).
