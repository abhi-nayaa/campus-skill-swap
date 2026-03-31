const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const frontendDir = path.resolve(__dirname, "..", "..", "frontend");
const port = Number(process.env.SELENIUM_TEST_PORT || 4173);

function contentTypeFor(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}

const server = http.createServer((req, res) => {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(frontendDir, safePath);

  if (!filePath.startsWith(frontendDir) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
  res.end(fs.readFileSync(filePath));
});

async function run() {
  await new Promise((resolve) => server.listen(port, resolve));

  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1024");

  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

  try {
    await driver.get(`http://127.0.0.1:${port}/register.html`);
    const registerBrand = await driver.wait(
      until.elementLocated(By.css(".auth-side .brand")),
      10000
    );
    const registerBrandText = await registerBrand.getText();
    if (!registerBrandText.includes("Campus Skill Swap")) {
      throw new Error("Register page brand text did not render as expected.");
    }

    await driver.get(`http://127.0.0.1:${port}/login.html`);
    await driver.wait(
      until.elementLocated(By.css('body[data-page="login"]')),
      10000
    );

    const loginForm = await driver.wait(
      until.elementLocated(By.css("#loginForm")),
      10000
    );
    await driver.wait(until.elementIsVisible(loginForm), 10000);

    const loginHeading = await driver.findElement(By.css(".auth-card h2"));
    const loginHeadingText = (await loginHeading.getAttribute("textContent")).trim();
    const pageTitle = await driver.getTitle();

    if (loginHeadingText !== "Login" && !pageTitle.includes("Login")) {
      throw new Error(`Unexpected login page markers. heading="${loginHeadingText}" title="${pageTitle}"`);
    }
  } finally {
    await driver.quit();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
