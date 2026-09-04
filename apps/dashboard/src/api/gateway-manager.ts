import { spawn, type ChildProcess } from "node:child_process";
import { basename, join } from "node:path";

export interface GatewayStartRequest {
  /** "mock" boots the built-in demo merchant; "rest" uses a merchant config file. */
  kind: "mock" | "rest";
  /** Absolute/relative path to a merchant config (required for kind "rest"). */
  configPath?: string;
  /** Merchant id for kind "rest" (derived from configPath when omitted). */
  merchantId?: string;
  port?: number;
  baseUrl?: string;
  razorpay?: { keyId?: string; keySecret?: string; webhookSecret?: string };
  auditPath?: string;
}

export interface GatewayStatus {
  running: boolean;
  kind?: string;
  port?: number;
  pid?: number;
  startedAt?: string;
  baseUrl?: string;
  lastError?: string;
  /** Merchant config the running gateway is serving (kind "rest"). */
  merchantId?: string;
}

const LOG_LIMIT = 500;

/**
 * Spawns the gateway as a child process (tsx via --import), streams its logs
 * into a ring buffer, and lets the dashboard start/stop/status it.
 */
export class GatewayManager {
  private child: ChildProcess | undefined;
  private logsBuffer: string[] = [];
  private startedAt: string | undefined;
  private lastError: string | undefined;
  private status: { kind?: string; port?: number; baseUrl?: string; merchantId?: string } = {};

  constructor(private readonly repoRoot: string) {}

  get logs(): string[] {
    return [...this.logsBuffer];
  }

  private pushLog(line: string): void {
    this.logsBuffer.push(line);
    if (this.logsBuffer.length > LOG_LIMIT) this.logsBuffer.splice(0, this.logsBuffer.length - LOG_LIMIT);
  }

  start(req: GatewayStartRequest): GatewayStatus {
    if (this.child && this.child.exitCode === null) {
      throw new Error("a gateway is already running — stop it first");
    }
    const port = req.port ?? 8787;
    const baseUrl = req.baseUrl ?? `http://localhost:${port}`;
    const entry = join(this.repoRoot, "apps", "gateway", "src", "run.ts");
    const merchantId =
      req.kind === "rest"
        ? req.merchantId ?? (req.configPath ? basename(req.configPath).replace(/\.json$/, "") : undefined)
        : undefined;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      BASE_URL: baseUrl,
    };
    if (req.kind === "rest" && req.configPath) {
      env.MERCHANT_CONFIG = req.configPath;
    }
    if (req.razorpay?.keyId && req.razorpay.keySecret) {
      env.RAZORPAY_KEY_ID = req.razorpay.keyId;
      env.RAZORPAY_KEY_SECRET = req.razorpay.keySecret;
      if (req.razorpay.webhookSecret) env.RAZORPAY_WEBHOOK_SECRET = req.razorpay.webhookSecret;
      env.RAZORPAY_MODE = "test";
    }
    if (req.auditPath) env.AGENTIFY_AUDIT_PATH = req.auditPath;

    this.logsBuffer = [];
    this.startedAt = new Date().toISOString();
    this.lastError = undefined;
    this.status = { kind: req.kind, port, baseUrl, merchantId };
    this.pushLog(`starting gateway (${req.kind}) on :${port} → ${baseUrl}`);

    this.child = spawn(process.execPath, ["--import", "tsx", entry], {
      cwd: this.repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout!.on("data", (d) => this.pushLog(String(d).trimEnd()));
    this.child.stderr!.on("data", (d) => this.pushLog(String(d).trimEnd()));
    this.child.on("exit", (code) => {
      this.pushLog(`gateway exited (code ${code})`);
      this.child = undefined;
    });
    this.child.on("error", (err) => {
      this.lastError = err.message;
      this.pushLog(`gateway error: ${err.message}`);
    });
    return this.getStatus();
  }

  stop(): GatewayStatus {
    if (this.child && this.child.exitCode === null) {
      this.child.kill("SIGTERM");
      this.pushLog("stop requested");
    }
    return this.getStatus();
  }

  getStatus(): GatewayStatus {
    const running = !!this.child && this.child.exitCode === null;
    return {
      running,
      kind: this.status.kind,
      port: this.status.port,
      pid: running ? this.child!.pid : undefined,
      baseUrl: this.status.baseUrl,
      startedAt: this.startedAt,
      lastError: this.lastError,
      merchantId: this.status.merchantId,
    };
  }
}
