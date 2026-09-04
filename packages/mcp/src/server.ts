import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CommerceProvider } from "@agentify/canonical-commerce";
import {
  CommerceToolRegistry,
  isToolFailure,
  type CommerceToolRegistryOptions,
  type ToolCallResult,
  type ToolSpec,
} from "./registry.js";

export const SERVER_NAME = "agent-commerce-gateway";
export const SERVER_VERSION = "0.1.0";

const SERVER_INSTRUCTIONS = [
  "You are shopping through a merchant exposed by the Agent Commerce Gateway.",
  "All prices are Money objects with `amount` in MINOR units (e.g. 399900 INR paise = Rs 3,999) and an ISO `currency`.",
  "Search may be approximate. Before recommending or completing any purchase you MUST call check_availability and get_offer to verify live stock and the live discounted price.",
  "Respect explicit buyer budgets: never propose items whose effective offer price exceeds the stated budget.",
  "Never invent product ids: use the ids returned by the tools.",
].join("\n");

function moneyText(amount: number | undefined, currency: string): string {
  if (amount === undefined) return "n/a";
  return `${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const CART_TOOLS = new Set([
  "create_cart",
  "get_cart",
  "add_to_cart",
  "update_cart_item",
  "remove_from_cart",
]);
const CHECKOUT_TOOLS = new Set(["create_checkout", "get_checkout", "cancel_checkout"]);

function renderCart(data: unknown): string {
  const cart = data as {
    id: string;
    status: string;
    currency: string;
    items: Array<{ id: string; variantId: string; title: string; quantity: number; unitPrice: { amount: number; currency: string } }>;
    subtotal: { amount: number; currency: string };
  };
  const lines = cart.items.map(
    (item) =>
      `  ${item.id} · ${item.quantity} × ${item.title} @ ${moneyText(item.unitPrice.amount, item.unitPrice.currency)}`,
  );
  return `cart ${cart.id} [${cart.status}]\n` +
    (lines.join("\n") || "  (empty)") +
    `\n  subtotal: ${moneyText(cart.subtotal.amount, cart.subtotal.currency)}`;
}

function renderCheckout(data: unknown): string {
  const checkout = data as {
    id: string;
    status: string;
    currency: string;
    totals?: { subtotal?: { amount: number; currency: string }; total?: { amount: number; currency: string } };
    orderId?: string;
  };
  const total = checkout.totals?.total
    ? ` total=${moneyText(checkout.totals.total.amount, checkout.totals.total.currency)}`
    : "";
  return `checkout ${checkout.id} [${checkout.status}]${total}${checkout.orderId ? ` orderId=${checkout.orderId}` : ""}`;
}

function renderOrder(data: unknown): string {
  const order = data as {
    id: string;
    checkoutId?: string;
    currency: string;
    status: string;
    total?: { amount: number; currency: string };
    createdAt: string;
  };
  return `order ${order.id} [${order.status}]${order.checkoutId ? ` checkoutId=${order.checkoutId}` : ""}${order.total ? ` total=${moneyText(order.total.amount, order.total.currency)}` : ""}`;
}

function renderPaymentIntent(data: unknown): string {
  const intent = data as {
    checkoutId: string;
    status: string;
    provider: string;
    paymentOrderId: string;
    paymentLinkId: string;
    paymentUrl: string;
    amount: { amount: number; currency: string };
  };
  return [
    `checkout ${intent.checkoutId} [${intent.status}]`,
    `  provider     : ${intent.provider}`,
    `  order id     : ${intent.paymentOrderId}`,
    `  payment link : ${intent.paymentLinkId}`,
    `  amount       : ${moneyText(intent.amount.amount, intent.amount.currency)}`,
    `  → buyer must approve and pay here: ${intent.paymentUrl}`,
  ].join("\n");
}


/** Render a tool result as human-readable text (structured data is also returned). */
function renderText(tool: string, data: unknown): string {
  if (CART_TOOLS.has(tool)) return renderCart(data);
  if (CHECKOUT_TOOLS.has(tool)) return renderCheckout(data);
  if (tool === "complete_checkout") {
    const maybeIntent = data as { paymentUrl?: unknown };
    if (maybeIntent.paymentUrl !== undefined) return renderPaymentIntent(data);
    return renderOrder(data);
  }
  if (tool === "get_order") return renderOrder(data);
  if (tool === "get_audit_trail") {
    const trail = data as {
      checkoutId: string;
      events: Array<{
        event: string;
        reasonCode?: string;
        timestamp: string;
        amount?: number;
        currency?: string;
        approval?: { required: boolean; granted?: boolean; received?: boolean };
        explanation?: string;
        order_id?: string;
        payment_id?: string;
      }>;
    };
    const lines = trail.events.map((e) => {
      const granted = e.approval ? (e.approval.granted ?? e.approval.received) : undefined;
      const approval = e.approval
        ? ` approval=${e.approval.required ? "required" : "n/a"}/${granted ? "granted" : "not-granted"}`
        : "";
      return `  [${e.timestamp}] ${e.event}${e.reasonCode ? ` (${e.reasonCode})` : ""}${e.order_id ? ` order=${e.order_id}` : ""}${e.payment_id ? ` payment=${e.payment_id}` : ""}${e.amount !== undefined ? ` amount=${e.amount}` : ""}${e.currency ? ` ${e.currency}` : ""}${approval}${e.explanation ? ` — ${e.explanation}` : ""}`;
    });
    return `Audit trail for checkout ${trail.checkoutId} (${trail.events.length} event(s))\n` +
      (lines.join("\n") || "  (no events)");
  }
  if (tool === "get_recommendations") {
    const recs = data as Array<{
      productId: string;
      variantId: string;
      title: string;
      kind: string;
      reason: string;
      price: { amount: number; currency: string };
      inStock: boolean;
    }>;
    if (recs.length === 0) return "No recommendations for this cart.";
    const lines = recs.map((r, i) => `${i + 1}. [${r.kind}] ${r.title} — ${moneyText(r.price.amount, r.price.currency)} (${r.inStock ? "in stock" : "low stock"}) — ${r.reason} | variantId=${r.variantId}`);
    return "Recommendations (budget-aware):\n" + lines.join("\n");
  }
  if (tool === "search_catalog") {
    const r = data as {
      items: Array<{
        id: string;
        title: string;
        category?: string;
        priceFrom?: { amount: number; currency: string };
        priceTo?: { amount: number; currency: string };
        inStock: boolean;
        variantsCount: number;
      }>;
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
    };
    const lines = r.items.map((item, i) => {
      const price =
        item.priceFrom && item.priceTo && item.priceFrom.amount !== item.priceTo.amount
          ? `${moneyText(item.priceFrom.amount, item.priceFrom.currency)} – ${moneyText(item.priceTo.amount, item.priceTo.currency)}`
          : item.priceFrom
            ? moneyText(item.priceFrom.amount, item.priceFrom.currency)
            : "price unavailable";
      return `${i + 1}. ${item.title}${item.category ? ` [${item.category}]` : ""} — ${price} | inStock=${item.inStock} | variants=${item.variantsCount} | productId=${item.id}`;
    });
    const paging = r.hasMore ? ` (more than ${r.items.length} shown; page ${r.page} of many)` : "";
    return `${r.total} product(s) matched${paging}\n` + (lines.join("\n") || "(none)");
  }

  if (tool === "get_product") {
    const p = data as { id: string; title: string; category?: string; variants: Array<{ id: string; sku?: string; title?: string; pricing: { listPrice: { amount: number; currency: string }; salePrice?: { amount: number; currency: string } }; availability: { status: string; quantity?: number } }> };
    const lines = p.variants.map((v) => {
      const sale = v.pricing.salePrice ? ` sale=${moneyText(v.pricing.salePrice.amount, v.pricing.salePrice.currency)}` : "";
      return `  variantId=${v.id}${v.sku ? ` sku=${v.sku}` : ""}${v.title ? ` "${v.title}"` : ""} list=${moneyText(v.pricing.listPrice.amount, v.pricing.listPrice.currency)}${sale} stock=${v.availability.status}${v.availability.quantity !== undefined ? ` (${v.availability.quantity})` : ""}`;
    });
    return `${p.title}${p.category ? ` [${p.category}]` : ""} (productId=${p.id})\n` + lines.join("\n");
  }

  if (tool === "get_variant") {
    const v = data as { id: string; sku?: string; pricing: { listPrice: { amount: number; currency: string }; salePrice?: { amount: number; currency: string } }; availability: { status: string; quantity?: number } };
    return `variantId=${v.id}${v.sku ? ` sku=${v.sku}` : ""} list=${moneyText(v.pricing.listPrice.amount, v.pricing.listPrice.currency)} stock=${v.availability.status}`;
  }

  if (tool === "check_availability") {
    const a = data as { status: string; quantity?: number };
    return `status=${a.status}${a.quantity !== undefined ? ` quantity=${a.quantity}` : ""}`;
  }

  if (tool === "get_offer") {
    const o = data as {
      productId: string;
      variantId: string;
      productTitle: string;
      sku?: string;
      price: { amount: number; currency: string };
      listPrice: { amount: number; currency: string };
      originalPrice?: { amount: number; currency: string };
      savings?: { amount: number; currency: string };
      discounts: Array<{ id: string; title?: string }>;
      availability: { status: string; quantity?: number };
    };
    const discount =
      o.discounts.length > 0 ? ` | discount: ${o.discounts.map((d) => d.title ?? d.id).join(", ")}` : "";
    return [
      `${o.productTitle} (productId=${o.productId}, variantId=${o.variantId}${o.sku ? `, sku=${o.sku}` : ""})`,
      `  price=${moneyText(o.price.amount, o.price.currency)}`,
      `  listPrice=${moneyText(o.listPrice.amount, o.listPrice.currency)}`,
      o.originalPrice ? `  originalPrice=${moneyText(o.originalPrice.amount, o.originalPrice.currency)}` : null,
      o.savings ? `  savings=${moneyText(o.savings.amount, o.savings.currency)}` : null,
      `  stock=${o.availability.status}${o.availability.quantity !== undefined ? ` (${o.availability.quantity})` : ""}`,
      discount,
    ]
      .filter((x): x is string => x !== null && x !== "")
      .join("\n");
  }

  return JSON.stringify(data, null, 2);
}

export function toolSpecsToSdkTools(specs: ToolSpec[]): Tool[] {
  return specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: z.toJSONSchema(spec.inputSchema) as unknown as Tool["inputSchema"],
  }));
}

function toCallResult(tool: string, outcome: ToolCallResult<unknown>): CallToolResult {
  if (!isToolFailure(outcome)) {
    const result: Record<string, unknown> = {
      content: [{ type: "text", text: renderText(tool, outcome.data) }],
      structuredContent: outcome.data as unknown as Record<string, unknown>,
    };
    if (outcome.agentProfile) {
      result._meta = { "ucp-agent": { profile: outcome.agentProfile } };
    }
    return result as unknown as CallToolResult;
  }
  const { error } = outcome;
  return {
    content: [
      {
        type: "text",
        text: `ERROR [${error.code}]: ${error.message}${
          error.details ? `\n${JSON.stringify(error.details)}` : ""
        }`,
      },
    ],
    isError: true,
  } as unknown as CallToolResult;
}

/**
 * Build an SDK Server bound to a provider. Create one per HTTP session.
 */
export function createCommerceMcpServer(
  provider: CommerceProvider,
  options: CommerceToolRegistryOptions = {},
): Server {
  const registry = new CommerceToolRegistry(provider, options);
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const specs = registry.list();
    return { tools: toolSpecsToSdkTools(specs) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const outcome = await registry.call(name, rawArgs);
    return toCallResult(name, outcome);
  });

  return server;
}

export interface StreamableHttpEndpoint {
  /** Handle any method (POST/GET/DELETE) on the MCP endpoint. */
  handle(request: Request): Promise<Response>;
  /** Destroy all active sessions. */
  close(): Promise<void>;
  activeSessionCount(): number;
}

interface Session {
  server: Server;
  transport: WebStandardStreamableHTTPServerTransport;
  /** Resolves once the server is connected to the transport. */
  ready: Promise<void>;
}

/**
 * A stateful Streamable HTTP endpoint backed by Web-Standards transports, so
 * it can be mounted on any runtime (Node/Hono/Workers). Sessions are keyed by
 * the `Mcp-Session-Id` header and each session gets its own Server+transport.
 */
export function createStreamableHttpEndpoint(
  provider: CommerceProvider,
  options: CommerceToolRegistryOptions = {},
): StreamableHttpEndpoint {
  const sessions = new Map<string, Session>();

  function createSession(): Session {
    const server = createCommerceMcpServer(provider, options);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    const conn: Session = {
      server,
      transport,
      ready: server.connect(transport),
    };
    return conn;
  }

  async function handle(request: Request): Promise<Response> {
    const sessionId = request.headers.get("mcp-session-id");
    const method = request.method.toUpperCase();

    if (method === "POST") {
      const existing = sessionId ? sessions.get(sessionId) : undefined;
      if (sessionId && !existing) {
        return new Response(null, { status: 404, statusText: "Session not found" });
      }
      const conn = existing ?? createSession();
      const isNewSession = !existing;
      await conn.ready;
      const response = await conn.transport.handleRequest(request);
      if (isNewSession && conn.transport.sessionId && !sessions.has(conn.transport.sessionId)) {
        sessions.set(conn.transport.sessionId, conn);
      }
      return response;
    }

    if (method === "GET" || method === "DELETE") {
      if (!sessionId) {
        return new Response(null, { status: 400, statusText: "Missing session id" });
      }
      const conn = sessions.get(sessionId);
      if (!conn) {
        return new Response(null, { status: 404, statusText: "Session not found" });
      }
      await conn.ready;
      return conn.transport.handleRequest(request);
    }

    return new Response(null, { status: 405, statusText: "Method not allowed" });
  }

  async function close(): Promise<void> {
    for (const conn of sessions.values()) {
      try {
        await conn.transport.close();
      } catch {
        // best-effort cleanup
      }
    }
    sessions.clear();
  }

  return {
    handle,
    close,
    activeSessionCount: () => sessions.size,
  };
}
