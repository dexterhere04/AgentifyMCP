import { json, origin, type Handler } from "../_lib.js";

function flattenLeaves(value: unknown, prefix = ""): Array<{ path: string; sample: string }> {
  const out: Array<{ path: string; sample: string }> = [];
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    if (value.length) flattenLeaves(value[0], prefix);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenLeaves(v, `${prefix}.${k}`);
    }
    return out;
  }
  out.push({ path: prefix || "$", sample: String(value) });
  return out;
}

function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const handler: Handler = async (req, res) => {
  const body = (await readBody(req)) as { url?: string };
  const url = body.url ?? "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return json(res, 400, { ok: false, error: "invalid url" });
  }
  const own = new URL(origin(req));
  if (parsedUrl.host !== own.host) {
    return json(res, 403, { ok: false, error: "Hosted demo: sample fetches are limited to this deployment's demo store." });
  }
  try {
    const upstream = await fetch(parsedUrl.toString(), { headers: { accept: "application/json" } });
    const text = await upstream.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    return json(res, 200, {
      ok: upstream.ok,
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
      body: parsed !== undefined ? parsed : text.slice(0, 2000),
      leaves: parsed !== undefined ? flattenLeaves(parsed).slice(0, 200) : [],
    });
  } catch (err) {
    return json(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

export default handler;
