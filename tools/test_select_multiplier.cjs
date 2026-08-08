const { chromium } = require('playwright');

(async () => {
  const multiplier = '0.75';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: 'satisfactory-crawler/1.0' });
  const url = 'https://satisfactory.wiki.gg/wiki/Fuel';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  // list all select elements
  const allSelects = await page.evaluate(() => Array.from(document.querySelectorAll('select')).map(s => ({ id: s.id, name: s.name, outer: s.outerHTML.slice(0,200) })));
  console.log('Found selects count:', allSelects.length);
  if (allSelects.length) console.log(allSelects.slice(0,10));

  // try to find selects matching multiplier heuristics
  const selHandle = await page.$('select[id*=multiplier], select[name*=multiplier], select[class*=cost-multiplier], select[class*=multiplier]');
  if (!selHandle) {
    console.log('No select element found for multiplier.');
  } else {
    const options = await selHandle.evaluate((s) => Array.from(s.options).map(o => ({ value: o.value, text: o.text })));
    console.log('Select options:', options);

    // try page.selectOption
    try {
      const selector = 'select[id*=multiplier], select[name*=multiplier], select[class*=cost-multiplier], select[class*=multiplier]';
      const selResult = await page.selectOption(selector, multiplier);
      console.log('selectOption result:', selResult);
    } catch (e) {
      console.log('selectOption failed:', e.message || e);
    }

    // also try setting via evaluate as fallback
    try {
      await page.evaluate((v) => {
        const s = document.querySelector('select[id*=multiplier], select[name*=multiplier], select[class*=cost-multiplier], select[class*=multiplier]');
        if (!s) return false;
        s.value = v;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, multiplier);
      console.log('set via evaluate completed');
    } catch (e) {
      console.log('evaluate set failed:', e.message || e);
    }

    await page.waitForTimeout(400);

    // extract the Residual Fuel product number after selection
    const residualProduct = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('table.recipetable tr, table.wikitable.recipetable tr')).find(tr => tr.textContent && tr.textContent.includes('Residual Fuel'));
      if (!row) return null;
      // find product item-num in products column
      const prod = row.querySelector('.recipe-items .recipe-item .item-minute .item-num');
      return prod ? prod.textContent.trim() : null;
    });

    console.log('Residual Fuel product number (post-selection):', residualProduct);

    // search for labels mentioning multiplier
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll('label, span, div, p')).filter(n => /multiplier|parts cost/i.test(n.textContent)).map(n => ({tag:n.tagName, text: n.textContent.trim().slice(0,120)})));
    console.log('Multiplier-related labels found:', labels.slice(0,10));

    // for comparison, fetch same number without selection by reloading and reading first
    await page.reload({ waitUntil: 'networkidle' });
    const before = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('table.recipetable tr, table.wikitable.recipetable tr')).find(tr => tr.textContent && tr.textContent.includes('Residual Fuel'));
      if (!row) return null;
      const prod = row.querySelector('.recipe-items .recipe-item .item-minute .item-num');
      return prod ? prod.textContent.trim() : null;
    });
    console.log('Residual Fuel product number (after reload, before selection):', before);
  }

  await browser.close();
})();