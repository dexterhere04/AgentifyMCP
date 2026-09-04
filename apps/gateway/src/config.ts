export interface GatewayConfig {
  /** HTTP port for the gateway server. */
  port: number;
  /** Public origin under which the gateway is reachable, e.g. https://demo.example. */
  baseUrl: string;
  /** Public origin of the merchant storefront (used to build product URLs). */
  storeUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const baseUrl = (env.BASE_URL ?? "http://localhost:8787").replace(/\/+$/, "");
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    port,
    baseUrl,
    storeUrl: (env.STORE_URL ?? baseUrl).replace(/\/+$/, ""),
  };
}
