const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://satisfactory.wiki.gg/wiki/Computer', { waitUntil: 'domcontentloaded' });
  const title = await page.$eval('#firstHeading', el => el.textContent).catch(() => null);
  const content = await page.content();
  fs.writeFileSync('tools/debug_computer.html', content);
  console.log('title:', title);
  await browser.close();
})();
