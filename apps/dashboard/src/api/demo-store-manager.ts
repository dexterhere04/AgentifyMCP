import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export interface DemoStoreStatus {
  running: boolean;
  port: number;
  pid?: number;
  startedAt?: string;
  lastError?: string;
}

const LOG_LIMIT = 120;

/**
 * Spawns the /testing basic-store backend (the REST demo merchant's store) as a
 * child process so the dashboard can boot it alongside the gateway.
 */
export class DemoStoreManager {
  private child: ChildProcess | undefined;
  private logsBuffer: string[] = [];
  private startedAt: string | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly repoRoot: string,
    readonly port = 8799,
  ) {}

  get logs(): string[] {
    return [...this.logsBuffer];
  }

  private pushLog(line: string): void {
    this.logsBuffer.push(line);
    if (this.logsBuffer.length > LOG_LIMIT) this.logsBuffer.splice(0, this.logsBuffer.length - LOG_LIMIT);
  }

  start(): DemoStoreStatus {
    if (this.child && this.child.exitCode === null) {
      throw new Error("testing store is already running");
    }
    const entry = join(this.repoRoot, "testing", "basic-store", "server.ts");
    this.logsBuffer = [];
    this.startedAt = new Date().toISOString();
    this.lastError = undefined;
    this.child = spawn(process.execPath, ["--import", "tsx", entry], {
      cwd: this.repoRoot,
      env: { ...process.env, PORT: String(this.port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout!.on("data", (d) => this.pushLog(String(d).trimEnd()));
    this.child.stderr!.on("data", (d) => this.pushLog(String(d).trimEnd()));
    this.child.on("exit", (code) => {
      this.pushLog(`testing store exited (code ${code})`);
      this.child = undefined;
    });
    this.child.on("error", (err) => {
      this.lastError = err.message;
      this.pushLog(`testing store error: ${err.message}`);
    });
    return this.getStatus();
  }

  stop(): DemoStoreStatus {
    if (this.child && this.child.exitCode === null) {
      this.child.kill("SIGTERM");
      this.pushLog("stop requested");
    }
    return this.getStatus();
  }

  getStatus(): DemoStoreStatus {
    const running = !!this.child && this.child.exitCode === null;
    return {
      running,
      port: this.port,
      pid: running ? this.child!.pid : undefined,
      startedAt: this.startedAt,
      lastError: this.lastError,
    };
  }
}
