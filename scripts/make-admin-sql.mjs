// Prints SQL that creates (or promotes) an ADMIN account with a password — for a database you
// can only reach through a SQL console (e.g. Supabase → SQL Editor). Nothing is sent anywhere.
//   node scripts/make-admin-sql.mjs
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import bcrypt from "bcryptjs";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
let muted = false; // typed characters echo as * while entering a password
const write = rl._writeToOutput;
rl._writeToOutput = (s) => write.call(rl, muted && !/[\r\n]/.test(s) ? "*".repeat(s.length) : s);

async function ask(q, hidden = false) {
  process.stdout.write(q);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return value ?? "";
}
const askHidden = (q) => ask(q, true);

const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const randomId = (length, alphabet) =>
  Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join("");

const email = (await ask("Admin email: ")).trim().toLowerCase();
const name = (await ask("Name: ")).trim() || "Admin";
const password = await askHidden("Password (8+ characters): ");
const again = await askHidden("Repeat password: ");
rl.close();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right.");
if (password.length < 8) throw new Error("Password must be at least 8 characters.");
if (password !== again) throw new Error("Passwords don't match.");

const hash = await bcrypt.hash(password, 12);
const id = "c" + randomId(24, "0123456789abcdefghijklmnopqrstuvwxyz");
const referralCode = randomId(10, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-");

console.log(`
-- Paste everything below into Supabase → SQL Editor and click Run.
INSERT INTO "User" ("id", "role", "name", "email", "emailVerified", "passwordHash", "referralCode", "onboardedAt", "updatedAt")
VALUES (${sql(id)}, 'ADMIN', ${sql(name)}, ${sql(email)}, now(), ${sql(hash)}, ${sql(referralCode)}, now(), now())
ON CONFLICT ("email") DO UPDATE
  SET "role" = 'ADMIN', "passwordHash" = EXCLUDED."passwordHash",
      "emailVerified" = COALESCE("User"."emailVerified", now()), "updatedAt" = now();
`);
