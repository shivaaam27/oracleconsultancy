/**
 * One-off codemod (portal unification, Sept 2026): put `await guardOwner();` at
 * the top of every exported async function in the administrator "use server"
 * files the Studio pages load, so none of them relies on the front door alone.
 * Idempotent — a function that already starts with a guard is left alone.
 *
 *   npx tsx scripts/guard-actions.mts src/app/foo/actions.ts …
 */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

const GUARD = /^\s*await guard(Owner|Viewer)\(/;

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, "utf8");
  if (!/^\s*["']use server["']/.test(src)) { console.log(`skip (not use server): ${file}`); continue; }
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const inserts: number[] = [];
  const isExported = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isAsync = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
  const addBody = (body: ts.Block | undefined) => {
    if (!body) return;
    const first = body.statements[0];
    if (first && GUARD.test(src.slice(first.getStart(sf), first.getEnd()))) return;
    inserts.push(body.getStart(sf) + 1); // just after "{"
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && isExported(st) && isAsync(st)) addBody(st.body);
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && isAsync(init) && ts.isBlock(init.body)) addBody(init.body);
      }
    }
  }
  if (!inserts.length) { console.log(`nothing to guard: ${file}`); continue; }
  let out = src;
  for (const at of inserts.sort((a, b) => b - a)) out = out.slice(0, at) + "\n  await guardOwner();" + out.slice(at);
  if (!/import \{[^}]*\bguardOwner\b[^}]*\} from "@\/lib\/viewer"/.test(out)) {
    out = out.replace(/^(\s*["']use server["'];?\s*\n)/, `$1import { guardOwner } from "@/lib/auth/viewer";\n`);
  }
  writeFileSync(file, out);
  console.log(`guarded ${inserts.length}: ${file}`);
}
