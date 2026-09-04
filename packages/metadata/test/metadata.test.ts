import { describe, expect, it } from "vitest";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import { createMetadata } from "../src/index.js";

const config = {
  baseUrl: "https://demo.example",
  supportedCountries: ["IN"],
};

describe("metadata generators", () => {
  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });

  it("generates a well-formed llms.txt (v2 order: H1, blockquote, sections)", async () => {
    const md = await createMetadata(provider, config);
    const txt = md.llmsTxt();
    const lines = txt.split("\n");
    expect(lines[0]).toBe("# Aarna Jewels");
    expect(lines[2]!.startsWith(">")).toBe(true);
    expect(txt).toContain("[agents.md](https://demo.example/agents.md)");
    expect(txt).toContain("[MCP endpoint](https://demo.example/mcp)");
    expect(txt).toContain("## Optional");
  });

  it("advertises only supported actions in agents.md", async () => {
    const md = await createMetadata(provider, config);
    const text = md.agentsMarkdown();
    expect(text).toContain("# Aarna Jewels — Agent Instructions");
    expect(text).toContain("Default currency: `INR`");
    expect(text).toContain("catalog (search + lookup)");
    // No cart/checkout tools are listed as supported actions
    expect(text).toContain("No cart, checkout, or payment is possible.");
  });

  it("includes policies and failure expectations", async () => {
    const md = await createMetadata(provider, config);
    const text = md.agentsMarkdown();
    expect(text).toContain("Shipping: https://demo.example/policies/shipping");
    expect(text).toContain("## Failure handling expectations");
  });
});
