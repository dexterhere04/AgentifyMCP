/**
 * Minimal JSON path reader for merchant mapping.
 *
 * Supports the small subset used by config-driven adapters:
 *   - `$`                        root
 *   - `.field` / `['field']`     object property
 *   - `[0]` / `['key']`          index / key access
 *   - `[*]`                      iterate over an array (collects results)
 *
 * `read(root, path)` returns the resolved value. A `[*]` step returns an array
 * of the results of the remaining path over each element. Missing properties
 * resolve to `undefined`.
 */

export function read(root: unknown, path: string): unknown {
  const tokens = tokenize(path);
  return walk(root, tokens, 0);
}

function walk(value: unknown, tokens: Array<string | number>, i: number): unknown {
  if (i >= tokens.length) return value;
  const token = tokens[i]!;

  if (token === "*") {
    if (!Array.isArray(value)) return undefined;
    const rest = tokens.slice(i + 1);
    if (rest.length === 0) return value;
    const results: unknown[] = [];
    for (const item of value) {
      const res = walk(item, rest, 0);
      if (res !== undefined) results.push(res);
    }
    return results;
  }

  if (value === null || typeof value !== "object") return undefined;
  const next =
    typeof token === "number"
      ? (value as unknown[])[token]
      : (value as Record<string, unknown>)[token];
  return walk(next, tokens, i + 1);
}

function tokenize(path: string): Array<string | number> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error(`empty json path`);
  let body = trimmed;
  if (body.startsWith("$")) body = body.slice(1);

  const tokens: Array<string | number> = [];
  // Matches `.name`, `['name']`, `[0]`, `[*]`, or a leading bare name.
  const re = /(?:\.([A-Za-z_$][A-Za-z0-9_$-]*))|(?:\[([0-9]+|\*|'[^']*'|"[^"]*")\])/g;
  // Bare root name after optional `$` without a leading dot, e.g. `$data`? Not supported.
  let match: RegExpExecArray | null;
  let last = 0;
  while ((match = re.exec(body)) !== null) {
    if (match.index !== last) {
      const between = body.slice(last, match.index);
      if (between.trim() !== "") {
        throw new Error(`invalid json path near "${between}" in "${path}"`);
      }
    }
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else {
      const bracket = match[2]!;
      if (bracket === "*") {
        tokens.push("*");
      } else if (/^[0-9]+$/.test(bracket)) {
        tokens.push(Number(bracket));
      } else {
        tokens.push(bracket.replace(/^['"]|['"]$/g, ""));
      }
    }
    last = match.index + match[0].length;
  }
  const tail = body.slice(last);
  if (tail.trim() !== "") {
    throw new Error(`invalid json path near "${tail}" in "${path}"`);
  }
  if (tokens.length === 0) throw new Error(`invalid json path "${path}"`);
  return tokens;
}

/** Render `{token}` template placeholders from a source row. */
export function interpolate(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{([A-Za-z0-9_.$[\]]+)\}/g, (full, key) => {
    const value = read(row, key.startsWith("$") ? key : `$.${key}`);
    if (value === undefined || value === null) return full;
    return String(value);
  });
}
