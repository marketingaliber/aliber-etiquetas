const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: +process.argv[3] || 1500, height: 900 } });
  p.on("console", (m) => console.log("console:", m.text()));
  p.on("pageerror", (e) => console.log("erro:", e.message));
  await p.goto("file://" + process.argv[2]);
  await p.waitForFunction(() => document.title === "ok", null, { timeout: 15000 }).catch(() => console.log("sem ok"));
  await p.screenshot({ path: process.argv[4] || "/tmp/claude-0/-home-claude/88f34bd1-eca3-58ac-bf90-52bab081b371/scratchpad/previa.png", fullPage: true });
  await b.close();
})();
