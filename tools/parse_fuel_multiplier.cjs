const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

(async () => {
  const multiplier = 0.75;
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: 'satisfactory-crawler/1.0' });
  const url = 'https://satisfactory.wiki.gg/wiki/Fuel';
  await page.goto(url, { waitUntil: 'networkidle' });

  // try to set multiplier
  try {
    // prefer select elements
    const setViaSelect = await page.evaluate((v) => {
      const sel = document.querySelector('select[id*=multiplier], select[name*=multiplier]');
      if (!sel) return false;
      sel.value = String(v);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, multiplier).catch(() => false);
    if (!setViaSelect) {
      const input = await page.$('input[id*=multiplier], input[name*=multiplier]');
      if (input) {
        await input.fill(String(multiplier));
        await input.dispatchEvent('change');
        await page.waitForTimeout(300);
      } else {
        const handle = await page.$('text="Recipe parts cost multiplier", text="Parts cost multiplier"');
        if (handle) {
          const container = await handle.evaluateHandle(n => n.closest('div, tbody, table, form, section') || n.parentElement);
          if (container) {
            const inp = await container.asElement().$('input[type=number], input');
            if (inp) {
              await inp.fill(String(multiplier));
              await inp.dispatchEvent('change');
              await page.waitForTimeout(300);
            }
          }
        }
      }
    } else {
      await page.waitForTimeout(300);
    }
  } catch (e) {
    // ignore
  }

  const content = await page.content();
  const $ = cheerio.load(content);
  const recipes = [];
  $('table.recipetable, table.wikitable.recipetable').each((_, table) => {
    const headers = $(table).find('th').map((i, th) => ($(th).text() || '').trim().toLowerCase()).get();
    const ingredientsIdx = headers.findIndex((t) => /ingredients?/.test(t));
    const productsIdx = headers.findIndex((t) => /products?/.test(t));
    const nameIdx = headers.findIndex((t) => /recipe/.test(t));
    if (ingredientsIdx === -1 && productsIdx === -1) return;
    $(table).find('tr').each((__, tr) => {
      if ($(tr).find('th').length) return;
      const tds = $(tr).find('td');
      if (!tds.length) return;
      const recipe = { name: '', products: [], ingredients: [] };
      if (nameIdx !== -1 && tds.eq(nameIdx).length) recipe.name = (tds.eq(nameIdx).text() || '').trim();
      const readItemsFromCell = (cell) => {
        const items = [];
        if (!cell || !cell.length) return items;
        const blocks = cell.find('.recipe-item');
        if (blocks.length) {
          blocks.each((i, b) => {
            const name = (cell.find('.item-name').eq(i).text() || $(b).find('a[title]').attr('title') || $(b).text()).trim();
            const num = (cell.find('.item-minute .item-num').eq(i).text() || $(b).find('.item-num').text() || '').trim();
            items.push({ item: name, rate: parseFloat((num||'').replace(/,/g, '')) || 0 });
          });
          return items;
        }
        cell.find('a[title]').each((i, a) => {
          const name = ($(a).attr('title') || $(a).text()).trim();
          const parent = $(a).closest('div');
          const num = parent.find('.item-minute .item-num').text().trim() || '';
          items.push({ item: name, rate: parseFloat((num||'').replace(/,/g, '')) || 0 });
        });
        return items;
      };
      if (ingredientsIdx !== -1) recipe.ingredients = readItemsFromCell(tds.eq(ingredientsIdx));
      if (productsIdx !== -1) recipe.products = readItemsFromCell(tds.eq(productsIdx));
      if ((recipe.products && recipe.products.length) || (recipe.ingredients && recipe.ingredients.length)) recipes.push(recipe);
    });
  });

  console.log('Found recipes on Fuel page with multiplier', multiplier, ':');
  for (const r of recipes) console.log('-', r.name, JSON.stringify(r));

  // compare with tools/recipes_1.json if exists
  try {
    const basePath = path.resolve(__dirname, 'recipes_1.json');
    if (fs.existsSync(basePath)) {
      const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
      const fuel = base.data && base.data['Fuel'];
      if (fuel) {
        console.log('\nBase (1x) Fuel recipes:');
        for (const r of fuel) console.log('-', r.name, JSON.stringify(r));
      }
    }
  } catch (e) {}

  await browser.close();
})();