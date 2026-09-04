import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "en-US",
  title: "Agentify",
  description:
    "Agentic Commerce Gateway — turn any ecommerce backend into an agent-native merchant (UCP discovery, MCP tools, approval-gated checkout, payments).",
  base: "/AgentifyMCP/",
  cleanUrls: true,
  head: [["meta", { name: "theme-color", content: "#0b66c3" }]],
  themeConfig: {
    logo: "https://raw.githubusercontent.com/dexterhere04/AgentifyMCP/main/docs/public/icon.svg",
    nav: [
      { text: "Home", link: "/" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "Shopping skill", link: "/SKILL.md" },
      { text: "GitHub", link: "https://github.com/dexterhere04/AgentifyMCP" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "Quickstart", link: "/getting-started/quickstart" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Canonical model", link: "/concepts/canonical-model" },
          { text: "Provider contract", link: "/concepts/provider-contract" },
          { text: "Capability graph", link: "/concepts/capability-graph" },
        ],
      },
      {
        text: "Integrations",
        items: [
          { text: "Integration matrix", link: "/integrations/matrix" },
          { text: "REST adapter", link: "/integrations/rest-adapter" },
          { text: "SDK adapter", link: "/integrations/sdk-adapter" },
          { text: "Framework middleware", link: "/integrations/middleware" },
        ],
      },
      {
        text: "Protocols",
        items: [
          { text: "UCP discovery", link: "/protocols/ucp" },
          { text: "MCP tools", link: "/protocols/mcp-tools" },
          { text: "Shopping skill", link: "/protocols/agent-skill" },
        ],
      },
      {
        text: "Payments & Deploy",
        items: [
          { text: "Razorpay", link: "/payments/razorpay" },
          { text: "Deploy", link: "/deploy/server" },
          { text: "Multi-tenant", link: "/deploy/multi-tenant" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Security", link: "/security" },
          { text: "Testing", link: "/testing" },
          { text: "Roadmap", link: "/roadmap" },
          { text: "API reference", link: "/reference/README" },
        ],
      },
    ],
    outline: "deep",
    search: { provider: "local" },
  },
});
