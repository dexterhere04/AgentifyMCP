import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runGenerate } from "../src/cli.js";

describe("agentify generate", () => {
  it("emits static agent files from the mock merchant", async () => {
    const out = await mkdtemp(join(tmpdir(), "agentify-static-"));
    try {
      const files = await runGenerate({
        mock: true,
        out,
        baseUrl: "https://demo.example",
      });
      const rel = files.map((f) => f.replace(`${out}/`, ""));
      expect(rel).toEqual(
        expect.arrayContaining(["llms.txt", "agents.md", "catalog.json", ".well-known/ucp"]),
      );

      const llms = await readFile(join(out, "llms.txt"), "utf8");
      expect(llms.startsWith("# Aarna Jewels")).toBe(true);

      const ucp = JSON.parse(await readFile(join(out, ".well-known/ucp"), "utf8"));
      expect(ucp.ucp.capabilities["dev.ucp.shopping.checkout"]).toBeDefined();

      const catalog = JSON.parse(await readFile(join(out, "catalog.json"), "utf8"));
      expect(catalog.total).toBeGreaterThan(0);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
