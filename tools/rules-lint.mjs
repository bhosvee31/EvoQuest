// Static sanity check for firestore.rules.
//
//   node tools\rules-lint.mjs
//
// Firestore Security Rules are NOT JavaScript. They are a small declarative
// language with no loops, no arrow functions, no Math/JSON/Date, and no ++/--.
// This script cannot run the real Rules compiler (that needs the Firebase
// emulator and a JDK), but it catches the constructs that are known to fail
// with a confusing "Unexpected 'for'" style error.
//
// It is deliberately conservative: it flags anything that is definitely invalid,
// and stays quiet about anything it is not sure about.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] || join(here, "..", "firestore.rules");
const src = readFileSync(path, "utf8");

const problems = [];
const add = (line, msg) => problems.push(`line ${line}: ${msg}`);

// strip comments so keywords inside them are not flagged
const lines = src.split("\n");
const code = lines.map(l => l.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, ""));

/* ---- constructs the Rules language does not have ---- */
const BANNED = [
  [/\bfor\s*\(/,                    "loops do not exist in Security Rules - unroll by hand"],
  [/\bwhile\s*\(/,                   "loops do not exist in Security Rules"],
  [/\bdo\s*\{/,                      "'do' loops do not exist in Security Rules"],
  [/\bvar\s+[A-Za-z_$]/,             "use 'let', not 'var'"],
  [/=>/,                            "arrow functions are not supported - use function name() {}"],
  [/\+\+/,                           "'++' is not supported - use '+= 1'"],
  [/--/,                            "'--' is not supported"],
  [/\bMath\./,                       "there is no Math in Security Rules"],
  [/\bJSON\./,                       "there is no JSON in Security Rules"],
  [/\bDate\.(now|parse)/,            "there is no Date in Security Rules"],
  [/\bnew\s+[A-Z]/,                  "'new' is not supported"],
  [/\btry\s*\{/,                     "there is no try/catch - use request.resource.exists() / .get()"],
  [/\bcatch\s*\(/,                   "there is no try/catch"],
  [/\btypeof\b/,                     "'typeof' is not supported - use 'is int' / 'is string' etc"],
  [/\bnull\b\s*[=!]==/,              "use 'is null' rather than comparing to null"],
  [/\bdelete\s+\w+\s*;/,             "'delete' as a statement is not supported"],
  [/\breturn\s+[^;]*\bawait\b/,      "'await' is not supported in rules"],
];

code.forEach((line, i) => {
  for (const [re, msg] of BANNED) {
    if (re.test(line)) add(i + 1, msg);
  }
});

/* ---- balance ---- */
const bal = { "{": 0, "(": 0, "[": 0 };
const pairs = { "}": "{", ")": "(", "]": "[" };
code.forEach((line, i) => {
  for (const ch of line) {
    if (ch in bal) bal[ch]++;
    else if (ch in pairs) {
      bal[pairs[ch]]--;
      if (bal[pairs[ch]] < 0) add(i + 1, `unbalanced '${ch}'`);
    }
  }
});
for (const [open, n] of Object.entries(bal)) {
  if (n !== 0) problems.push(`unbalanced '${open}': ${n > 0 ? n + " unclosed" : -n + " extra"}`);
}

/* ---- required structure ---- */
const required = [
  [/^\s*rules_version\s*=\s*'2'\s*;/m, "must declare rules_version = '2';"],
  [/match\s+\/databases\/\{database\}\/documents/, "must match /databases/{database}/documents"],
  [/match\s+\/profiles\/\{uid\}/,      "must match the profiles collection the game writes to"],
];
for (const [re, msg] of required) {
  if (!re.test(src)) problems.push(`structure: ${msg}`);
}

/* ---- the document id must be the caller's uid ---- */
if (/match\s+\/profiles\/\{uid\}/.test(src) && !/request\.auth\.uid\s*==\s*uid/.test(src)) {
  problems.push("structure: /profiles/{uid} must be guarded by request.auth.uid == uid");
}

/* ---- the rules' field list must match what the game actually writes ----
   If these drift apart every cloud save is rejected with PERMISSION_DENIED and
   the account silently stops saving, which is painful to debug later. */
{
  const listMatch = src.match(/hasOnlyKnownFields\(\)\s*\{[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/);
  if (!listMatch) {
    problems.push("structure: could not find the hasOnly([...]) field list to cross-check");
  } else {
    const rulesFields = (listMatch[1].match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, "")).sort();
    let gameFields = null;
    try {
      const { boot } = await import("./harness.mjs");
      const ctx = boot();
      const game = ctx.G;                       // boot() returns the context
      const blank = game.Accounts.blank();
      const merged = game.Accounts.merge(blank, null);
      gameFields = Object.keys(merged).sort();
    } catch (e) {
      problems.push(`could not boot the game to read the profile shape: ${e.message}`);
      if (process.env.RULES_LINT_DEBUG) console.error(e.stack);
    }
    if (gameFields) {
      const missing = gameFields.filter(f => !rulesFields.includes(f));
      const extra   = rulesFields.filter(f => !gameFields.includes(f));
      if (missing.length) problems.push(`rules: hasOnly() is missing field(s) the game writes: ${missing.join(", ")}`);
      if (extra.length)   problems.push(`rules: hasOnly() lists field(s) the game never writes: ${extra.join(", ")}`);
      if (!missing.length && !extra.length) {
        console.log(`field list matches the game profile exactly (${gameFields.length} fields): ${gameFields.join(", ")}`);
      }
    }
  }
}

if (problems.length) {
  console.log(`--- ${problems.length} problem(s) in ${path} ---`);
  problems.forEach(p => console.log("  " + p));
  process.exit(1);
}

const fns = (src.match(/\bfunction\s+\w+\s*\(/g) || []).length;
const allows = (src.match(/\ballow\s+\w+/g) || []).length;
console.log(`${path}: OK - ${fns} helper function(s), ${allows} allow rule(s), no unsupported constructs`);
