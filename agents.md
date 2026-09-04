# Agentify — Repository Agent Instructions

> Coding-agent orientation for the Agentify monorepo (agentic commerce gateway).

## Setup

- Deps: `pnpm install` (pnpm ≥ 9, Node ≥ 22)
- Typecheck: `pnpm typecheck` (per-package `tsc --noEmit`)
- Tests: `pnpm test` (Vitest; includes the shared adapter **contract suite**)
- Build: `pnpm build` (compiles ESM + `.d.ts` into each `dist/`)

## Code conventions

- TypeScript strict; ESM everywhere (`"type": "module"`); imports use explicit
  `.js` specifiers for relative files; `@agentify/*` for workspace packages.
- Workspace packages export TS source (`src/index.ts`) for dev; publishing is
  done from compiled `dist/` via `publishConfig`.
- Keep UCP/MCP independent of merchant schemas: adapters normalize onto the
  canonical model; never import adapter internals into protocol packages.

## Conventions

- Merchant data shapes are normalized in adapters (`catalog`/`inventory`/
  `pricing`/`cart`/`checkout`/`orders` optional).
- Money is always `{ amount, currency }` in minor units.
- Capability-gated tool surfaces and UCP profiles are derived, never hand-edited.
- If you change the canonical model or adapter contract, update the shared
  contract suite (`tests/contracts/`) and every adapter must still pass it.

## Commands

- Run one package: `pnpm --filter @agentify/<name> test|typecheck|build`
- Demos: `pnpm demo`, `pnpm demo:second`, `pnpm demo:razorpay`
- Gateway server: `pnpm gateway`
- CLI: `pnpm exec tsx packages/cli/src/cli.ts --help`
