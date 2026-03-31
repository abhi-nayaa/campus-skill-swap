const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontendDir = path.resolve(__dirname, "..");

function readFrontendFile(relativePath) {
  return fs.readFileSync(path.join(frontendDir, relativePath), "utf8");
}

for (const file of ["index.html", "login.html", "register.html"]) {
  assert.equal(fs.existsSync(path.join(frontendDir, file)), true, `${file} should exist`);
}

const loginMarkup = readFrontendFile("login.html");
const registerMarkup = readFrontendFile("register.html");
assert.match(loginMarkup, /Campus Skill Swap/);
assert.match(registerMarkup, /Campus Skill Swap/);

const styles = readFrontendFile(path.join("css", "styles.css"));
assert.match(styles, /\.auth-shell\s*\{/);
assert.match(styles, /\.auth-side\s+\.brand\s*\{/);

console.log("Frontend smoke tests passed.");
