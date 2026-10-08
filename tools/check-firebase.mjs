// Checks the Firebase config pasted into index.html without needing a browser.
//
//   node tools\check-firebase.mjs
//
// Boots the game and reads the real, evaluated FB_CONFIG rather than regex
// parsing the source, so this checks the thing the game actually sees. Safe to
// run with no network.

import { boot } from "./harness.mjs";

let pass = 0, fail = 0, warn = 0;
const ok   = (n, c, x) => { if (c) { pass++; console.log(`  PASS  ${n}`); }
                               else { fail++; console.log(`  FAIL  ${n}${x ? "  -> " + x : ""}`); } };
const soft = (n, c, x) => { if (c) { pass++; console.log(`  PASS  ${n}`); }
                               else { warn++; console.log(`  WARN  ${n}${x ? "  -> " + x : ""}`); } };

console.log("\ngame boots");
let G;
try {
  const ctx = boot();
  G = ctx.G;
  ok("index.html parses and the game initialises", true);
} catch (e) {
  ok("index.html parses and the game initialises", false, e.message);
  console.log("\n  (a syntax error in FB_CONFIG would kill the whole game script)");
  process.exit(1);
}

console.log("\nFB_CONFIG");
const cfg = G.FB_CONFIG || {};
const keys = Object.keys(cfg);
console.log(`        keys: ${keys.join(", ") || "(none)"}`);

const GATED = ["apiKey", "projectId", "appId"];
const missing = GATED.filter(k => !(typeof cfg[k] === "string" && cfg[k].trim()));
ok("the keys the game gates on are filled in", missing.length === 0,
   missing.length ? "still empty: " + missing.join(", ") : "");

if (cfg.apiKey)    soft("apiKey looks like a Firebase web key", /^AIza[0-9A-Za-z_-]{10,}$/.test(cfg.apiKey), cfg.apiKey.slice(0, 8) + "...");
if (cfg.projectId) soft("projectId is lowercase-dashed", /^[a-z0-9-]{3,}$/.test(cfg.projectId), cfg.projectId);
if (cfg.appId)     soft("appId looks like 1:num:web:hash", /^1:\d+:web:[0-9a-f]+$/.test(cfg.appId), cfg.appId);
if (cfg.authDomain) soft("authDomain ends with firebaseapp.com", /firebaseapp\.com$/.test(cfg.authDomain), cfg.authDomain);
if (cfg.storageBucket) soft("storageBucket looks like a bucket", /\.firebasestorage\.app$|\.appspot\.com$/.test(cfg.storageBucket), cfg.storageBucket);

const blank = keys.filter(k => !String(cfg[k]).trim());
ok("no key is left blank once you start filling them in", !GATED.some(k => blank.includes(k)) || GATED.every(k => blank.includes(k)),
   blank.length ? "blank: " + blank.join(", ") : "");

console.log("\naccounts switched on");
ok("Accounts.configured is true", G.Accounts.configured === true, `configured=${G.Accounts.configured}`);
ok("account UI is wired up", typeof G.renderAccountUI === "function");
ok("local profile still works with no network", !!G.Accounts.local().name);
ok("merge policy is present", typeof G.Accounts.merge === "function");
ok("sign-in methods are wired", ["signUp","signIn","signInGoogle","signInAnon","signOut","upgrade"]
  .every(m => typeof G.Accounts[m] === "function"));

if (!G.Accounts.configured){
  console.log("\n  -> accounts are still OFF. Paste your Firebase web-app config into");
  console.log("     FB_CONFIG near the top of the game script, then run this again.");
}

console.log("\nremaining console steps");
console.log("  1. Authentication -> Sign-in method -> enable Email/Password");
console.log("  2. Authentication -> Sign-in method -> enable Google");
console.log("  3. Authentication -> Sign-in method -> enable Anonymous");
console.log("  4. Authentication -> Settings -> Authorized domains -> add bhosvee31.github.io");
console.log("  5. Firestore -> Rules -> publish firestore.rules");
console.log("        (check it first:  node tools\\rules-lint.mjs)");
console.log("\n  then test over http, not file://:");
console.log("        python -m http.server 8000   ->  http://localhost:8000");

console.log(`\n${pass} passed, ${fail} failed, ${warn} warning(s)\n`);
process.exit(fail ? 1 : 0);
