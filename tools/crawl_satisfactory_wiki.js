#!/usr/bin/env node
// Crawl Satisfactory Wiki items and extract recipes for a given parts multiplier.
// Usage: node crawl_satisfactory_wiki.js --multiplier=1 --out=tools/recipes_1.json

const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const multiplier = Number(argv.multiplier ?? argv.m ?? 1);
const outFile = argv.out ?? `tools/recipes_${multiplier}.json`;

const { chromium } = require('playwright');

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function collectItemLinks(page) {
  const links = new Set();
  let url = 'https://satisfactory.wiki.gg/wiki/Category:Items';
  while (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // gather anchors inside category pages
    const pageLinks = await page.$$eval('#mw-pages a, .mw-category a', (anchors) =>
      anchors.map((a) => ({ href: a.href, text: a.textContent.trim() }))
    );
    for (const l of pageLinks) links.add(l.href);
    // try to find "next page" link in category pagination
    const next = await page.$('a[rel="next"], #mw-pages a:has-text("next page"), .mw-pagination a:has-text("next page")');
    if (next) {
      const href = await next.getAttribute('href');
      url = new URL(href, page.url()).toString();
    } else {
      url = null;
    }
  }
  return [...links];
}

function parseNumber(s) {
  if (!s) return 0;
  // remove commas, units, and find first number
  const m = s.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

async function setMultiplierIfPresent(page, value) {
  // try to find an input near text "Recipe parts cost multiplier" or "Parts cost multiplier"
  const labelHandles = await page.$$('text=Recipe parts cost multiplier, text=Parts cost multiplier');
  // fallback: search for input with id or name containing "multiplier"
  if (labelHandles.length === 0) {
    const input = await page.$('input[id*=multiplier], input[name*=multiplier]');
    if (input) {
      try {
        await input.fill(String(value));
        await input.dispatchEvent('change');
        await sleep(150);
        return true;
      } catch (e) {}
    }
    return false;
  }

  for (const h of labelHandles) {
    try {
      // try to find nearby input
      const container = await h.evaluateHandle((n) => n.closest('div, tbody, table, form, section') || n.parentElement);
      const input = await container.asElement().$('input[type=number], input');
      if (input) {
        await input.fill(String(value));
        await input.dispatchEvent('change');
        await sleep(150);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function extractRecipesFromPage(page) {
  // Find tables that contain both "Ingredients" and "Products" headers
  const recipeTables = await page.$$eval('table', (tables) => {
    return tables.map((t) => {
      const text = t.textContent || '';
      if (/Ingredients/i.test(text) && /Products?/i.test(text)) {
        // capture outerHTML so we can re-query in playwright context
        return t.outerHTML;
      }
      return null;
    }).filter(Boolean);
  });

  const recipes = [];
  for (let i = 0; i < recipeTables.length; i++) {
    // create a detached DOM and parse rows using a simple regex approach
    const tableHtml = recipeTables[i];
    // naive parsing: find rows
    const rows = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, 'text/html');
    const table = doc.querySelector('table');
    if (!table) continue;
    // find header positions
    const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent.trim());
    // find ingredient and product rows by searching for headings
    // We'll collect any rows that mention "Ingredient"/"Product" in a preceding header
    const trs = Array.from(table.querySelectorAll('tr'));
    let currentSection = null;
    const recipe = { name: '', products: [], ingredients: [] };
    for (const tr of trs) {
      const th = tr.querySelector('th');
      if (th) {
        const txt = th.textContent.trim();
        if (/Products?/i.test(txt)) currentSection = 'products';
        else if (/Ingredients?/i.test(txt)) currentSection = 'ingredients';
        else if (/Recipe|Recipes?/i.test(txt)) currentSection = 'name';
        continue;
      }
      const cols = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim());
      if (cols.length === 0) continue;
      if (currentSection === 'products') {
        // try to extract product name and rate
        // many tables have product in first col and amount in second
        recipe.products.push({ item: cols[0], rate: parseNumber(cols.slice(1).join(' ')) });
      } else if (currentSection === 'ingredients') {
        recipe.ingredients.push({ item: cols[0], rate: parseNumber(cols.slice(1).join(' ')) });
      } else if (currentSection === 'name') {
        recipe.name = cols.join(' | ');
      }
    }
    // normalize
    if (recipe.products.length || recipe.ingredients.length) recipes.push(recipe);
  }
  return recipes;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  console.log('Collecting item links...');
  const itemLinks = await collectItemLinks(page);
  console.log(`Found ${itemLinks.length} item pages.`);

  const out = {};
  for (let i = 0; i < itemLinks.length; i++) {
    const link = itemLinks[i];
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      const title = await page.$eval('#firstHeading', (h) => h.textContent.trim()).catch(() => null);
      if (!title) continue;
      // set multiplier where possible
      await setMultiplierIfPresent(page, multiplier).catch(() => {});
      // extract recipe tables
      // execute in page's DOM to use real DOMParser
      const recipes = await page.evaluate(() => {
        const out = [];
        const tables = Array.from(document.querySelectorAll('table'));
        for (const t of tables) {
          const text = t.textContent || '';
          if (!/Ingredients/i.test(text) || !/Products?/i.test(text)) continue;
          const recipe = { name: '', products: [], ingredients: [] };
          const rows = Array.from(t.querySelectorAll('tr'));
          let section = null;
          for (const r of rows) {
            const th = r.querySelector('th');
            if (th) {
              const txt = th.textContent.trim();
              if (/Products?/i.test(txt)) section = 'products';
              else if (/Ingredients?/i.test(txt)) section = 'ingredients';
              else if (/Recipe|Recipes?/i.test(txt)) section = 'name';
              continue;
            }
            const cols = Array.from(r.querySelectorAll('td')).map((td) => td.textContent.trim());
            if (cols.length === 0) continue;
            if (section === 'products') {
              recipe.products.push({ item: cols[0], rate: cols.slice(1).join(' ') });
            } else if (section === 'ingredients') {
              recipe.ingredients.push({ item: cols[0], rate: cols.slice(1).join(' ') });
            } else if (section === 'name') {
              recipe.name = cols.join(' | ');
            }
          }
          if (recipe.products.length || recipe.ingredients.length) out.push(recipe);
        }
        return out;
      });

      // post-process numeric rates
      for (const r of recipes) {
        r.products = r.products.map((p) => ({ item: p.item, rate: parseNumber(String(p.rate)) }));
        r.ingredients = r.ingredients.map((q) => ({ item: q.item, rate: parseNumber(String(q.rate)) }));
      }

      out[title] = recipes;
      console.log(`[${i + 1}/${itemLinks.length}] ${title}: ${recipes.length} recipe(s)`);
    } catch (e) {
      console.error('Error processing', link, e.message || e);
    }
  }

  await browser.close();

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ multiplier, generatedAt: new Date().toISOString(), data: out }, null, 2), 'utf8');
  console.log('Wrote', outFile);

  // mark todo as completed
  try { /* noop */ } catch (e) {}
})();
