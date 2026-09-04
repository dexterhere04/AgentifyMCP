import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// After `vitepress build`, keep the agent-facing skill available as RAW
// markdown at /SKILL.md (agents fetch the playbook, not the rendered page).
const out = join(process.cwd(), "docs", ".vitepress", "dist", "SKILL.md");
mkdirSync(dirname(out), { recursive: true });
copyFileSync(join(process.cwd(), "docs", "SKILL.md"), out);
if (!existsSync(out)) {
  console.error("failed to copy SKILL.md into the docs output");
  process.exit(1);
}
console.log("copied raw SKILL.md ->", out);
