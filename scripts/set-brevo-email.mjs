// Saves Brevo SMTP settings to the linked Vercel project (Production) without hand-editing URLs.
//   node scripts/set-brevo-email.mjs
// Asks for the Brevo SMTP login, SMTP key and sender email, then sets EMAIL_SERVER and EMAIL_FROM.
import { execSync } from "node:child_process";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();

/** Asks until the answer passes `valid` (stray Enter presses just re-ask). */
async function ask(q, valid, hint) {
  for (;;) {
    process.stdout.write(q);
    const { value, done } = await lines.next();
    if (done) throw new Error("Input ended before all questions were answered.");
    const answer = value.trim();
    if (valid(answer)) return answer;
    if (answer) console.log(`  ${hint}`);
  }
}

const login = await ask(
  "Brevo SMTP Login (looks like 9a1b2c001@smtp-brevo.com): ",
  (a) => /^\S+@\S+$/.test(a),
  "That doesn't look right — copy the Login from Brevo → SMTP & API → SMTP (it contains @).",
);
const key = await ask(
  "Brevo SMTP key (starts with xsmtpsib-): ",
  (a) => /^\S{20,}$/.test(a),
  "That doesn't look like an SMTP key — it is a long code with no spaces.",
);
const sender = await ask(
  "Sender email you verified in Brevo (e.g. avenidorey3@gmail.com): ",
  (a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a),
  "Enter an email address.",
);
rl.close();

const server = `smtp://${encodeURIComponent(login)}:${encodeURIComponent(key)}@smtp-relay.brevo.com:587`;

function setEnv(name, value) {
  try {
    execSync(`npx vercel env rm ${name} production --yes`, { stdio: "ignore" });
  } catch {
    // Not set yet — fine.
  }
  execSync(`npx vercel env add ${name} production`, { input: value, stdio: ["pipe", "ignore", "inherit"] });
  console.log(`Saved ${name}`);
}

setEnv("EMAIL_SERVER", server);
setEnv("EMAIL_FROM", `EcoQuest PH <${sender}>`);
console.log("\nDone. Tell Claude so it can redeploy and test.");
