#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const argv = require('minimist')(process.argv.slice(2));
const multiplier = Number(argv.multiplier ?? argv.m ?? 0.75);
const outFile = argv.out ?? `tools/recipes_${String(multiplier).replace('.', '_')}.json`;

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function collectItemLinks() {
  const api = 'https://satisfactory.wiki.gg/api.php';
  const categories = ['Category:Items', 'Category:Gases', 'Category:Liquids'];
  const links = new Set();

  for (const cmtitle of categories) {
    let cmcontinue = undefined;
    do {
      const params = new URLSearchParams({ action: 'query', list: 'categorymembers', cmtitle, cmlimit: '500', format: 'json' });
      if (cmcontinue) params.set('cmcontinue', cmcontinue);
      const url = `${api}?${params.toString()}`;
      let data = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch(url, { headers: { 'User-Agent': 'satisfactory-crawler/1.0' } });
        try { data = await res.json(); } catch (e) { data = null; }
        if (data && data.error && data.error.code === 'ratelimited') {
          const wait = 2000 * (attempt + 1);
          console.log('Rate limited by API, sleeping', wait, 'ms');
          await sleep(wait);
          continue;
        }
        break;
      }
      if (!data) break;
      if (data && data.query && data.query.categorymembers) {
        for (const cm of data.query.categorymembers) {
          if (cm.ns === 0 && !cm.title.includes('/')) links.add(cm.title);
        }
      }
      cmcontinue = data.continue && data.continue.cmcontinue;
      await sleep(250);
    } while (cmcontinue);
  }

  return Array.from(links);
}

function parseNumber(s) {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

function sanitizeName(s) {
  if (!s || typeof s !== 'string') return s;
  let out = s.replace(/[\u00A0\u202F\u200B\u2060]/g, '');
  out = out.trim();
  const am = out.match(/^(.*?)\s*Alternate\s*(.*)$/i);
  if (am) {
    const base = am[1].trim();
    const suffix = (am[2] || '').trim();
    out = suffix ? `Alt: ${base} ${suffix}` : `Alt: ${base}`;
  }
  return out;
}

function tableInAllowedSection($, table) {
  // Accept tables that appear before the 'Usage' section (id="Usage").
  // If no Usage anchor is present, default to allowing the table.
  try {
    const usageAnchor = $('#Usage');
    if (!usageAnchor || !usageAnchor.length) return true;
    const usageHeading = usageAnchor.closest('h1,h2,h3,h4,h5,h6');
    if (!usageHeading || !usageHeading.length) return true;

    // Starting from the table, walk forward in document order; if we reach the
    // usageHeading, then the table is before Usage (allowed). If we reach the
    // end without hitting usageHeading, it's after Usage (disallowed).
    let el = $(table);
    const maxSteps = 10000; // safety
    let steps = 0;
    while (el && el.length && steps++ < maxSteps) {
      if (el.is(usageHeading)) return true;
      // move to next sibling if present
      let next = el.next();
      if (next && next.length) { el = next; continue; }
      // otherwise climb to parent and try parent's next sibling
      let parent = el.parent();
      let moved = false;
      while (parent && parent.length) {
        next = parent.next();
        if (next && next.length) { el = next; moved = true; break; }
        parent = parent.parent();
      }
      if (moved) continue;
      break;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function setMultiplierIfPresent(page, value) {
  try {
    const valStr = String(value);

    // 1) Try to set a <select> directly via page.evaluate (works in most cases)
    const setViaSelect = await page.evaluate((v) => {
      const sel = document.querySelector('select[id*=multiplier], select[name*=multiplier], select[class*=cost-multiplier], select[class*=multiplier]');
      if (!sel) return false;
      // try to set by value
      sel.value = String(v);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, valStr).catch(() => false);
    if (setViaSelect) {
      await sleep(150);
      return true;
    }

    // 2) Try to find any select near the multiplier label
    const labelHandles = await page.$$('text=Recipe parts cost multiplier, text=Parts cost multiplier');
    for (const h of labelHandles) {
      try {
        const container = await h.evaluateHandle((n) => n.closest('div, tbody, table, form, section') || n.parentElement);
        if (!container) continue;
        const sel = await container.asElement().$('select[id*=multiplier], select[name*=multiplier], select[class*=cost-multiplier], select[class*=multiplier]');
        if (sel) {
          try {
            // prefer using evaluate on the select handle
            await sel.evaluate((s, v) => { s.value = String(v); s.dispatchEvent(new Event('change', { bubbles: true })); }, valStr);
            await sleep(150);
            return true;
          } catch (e) {
            // fallback: click matching option
            const options = await sel.$$('option');
            for (const opt of options) {
              const ov = await (await opt.getProperty('value')).jsonValue();
              if (String(ov) === valStr) {
                await opt.click();
                await sleep(150);
                return true;
              }
            }
          }
        }
      } catch (e) {
        // ignore per-page errors
      }
    }

    // 3) Fallback: try input fields as before
    const input = await page.$('input[id*=multiplier], input[name*=multiplier], input[class*=multiplier]');
    if (input) {
      try {
        await input.fill(valStr);
        await input.dispatchEvent('change');
        await sleep(150);
        return true;
      } catch (e) {}
    }
  } catch (e) {
    // ignore
  }
  return false;
}

(async () => {
  console.log('Collecting item links via MediaWiki API...');
  const titles = await collectItemLinks();
  console.log(`Found ${titles.length} item pages.`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: 'satisfactory-crawler/1.0' });

  const api = 'https://satisfactory.wiki.gg/api.php';
  const out = {};

  for (let i = 0; i < titles.length; i++) {
    const rawTitle = titles[i];
    const title = sanitizeName(rawTitle);
    try {
      process.stdout.write(`Processing [${i+1}/${titles.length}] ${title}\r`);
      // first get parse HTML to check if page has recipetable
      const params = new URLSearchParams({ action: 'parse', page: rawTitle, prop: 'text', format: 'json' });
      const url = `${api}?${params.toString()}`;
      let data = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch(url, { headers: { 'User-Agent': 'satisfactory-crawler/1.0' } });
        try { data = await res.json(); } catch (e) { data = null; }
        if (data && data.error && data.error.code === 'ratelimited') { await sleep(2000*(attempt+1)); continue; }
        break;
      }
      if (!data || !data.parse || !data.parse.text) { out[title] = []; console.log(`\n  parse missing for ${title}`); continue; }
      const parsedHtml = data.parse.text['*'];
      // if page doesn't contain recipetable, parse using the API HTML (fast)
      if (!/recipetable/.test(parsedHtml)) {
        const $ = cheerio.load(parsedHtml);
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
                  items.push({ item: name, rate: parseNumber(String(num)) });
                });
                return items;
              }
              cell.find('a[title]').each((i, a) => {
                const name = ($(a).attr('title') || $(a).text()).trim();
                const parent = $(a).closest('div');
                const num = parent.find('.item-minute .item-num').text().trim() || '';
                items.push({ item: name, rate: parseNumber(String(num)) });
              });
              return items;
            };
            if (ingredientsIdx !== -1) recipe.ingredients = readItemsFromCell(tds.eq(ingredientsIdx));
            if (productsIdx !== -1) recipe.products = readItemsFromCell(tds.eq(productsIdx));
            if ((recipe.products && recipe.products.length) || (recipe.ingredients && recipe.ingredients.length)) recipes.push(recipe);
          });
        });
        for (const r of recipes) {
          r.name = sanitizeName(r.name);
        }
        out[title] = recipes.map(r => ({ name: r.name, products: r.products, ingredients: r.ingredients }));
        continue;
      }

      // page has recipetable; load in browser to set multiplier
      const pageUrl = `https://satisfactory.wiki.gg/wiki/${encodeURIComponent(rawTitle.replace(/ /g, '_'))}`;
      await page.goto(pageUrl, { waitUntil: 'networkidle' });
      if (multiplier !== 1) {
        const ok = await setMultiplierIfPresent(page, multiplier);
        if (!ok) {
          // still proceed; some pages have server-side rendering
        }
        await sleep(300);
      }
      const content = await page.content();
      const $ = cheerio.load(content);
      const recipes = [];
      $('table.recipetable, table.wikitable.recipetable').each((_, table) => {
        const headers = $(table).find('th').map((i, th) => ($(th).text() || '').trim().toLowerCase()).get();
        // skip tables not under Crafting/Obtaining
        if (!tableInAllowedSection($, table)) return;
        // skip tables not under Crafting/Obtaining
        if (!tableInAllowedSection($, table)) return;
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
                items.push({ item: name, rate: parseNumber(String(num)) });
              });
              return items;
            }
            cell.find('a[title]').each((i, a) => {
              const name = ($(a).attr('title') || $(a).text()).trim();
              const parent = $(a).closest('div');
              const num = parent.find('.item-minute .item-num').text().trim() || '';
              items.push({ item: name, rate: parseNumber(String(num)) });
            });
            return items;
          };
          if (ingredientsIdx !== -1) recipe.ingredients = readItemsFromCell(tds.eq(ingredientsIdx));
          if (productsIdx !== -1) recipe.products = readItemsFromCell(tds.eq(productsIdx));
          if ((recipe.products && recipe.products.length) || (recipe.ingredients && recipe.ingredients.length)) recipes.push(recipe);
        });
      });
      for (const r of recipes) r.name = sanitizeName(r.name);
      out[title] = recipes;

    } catch (e) {
      console.error('\nError processing', title, e.message || e);
      out[title] = [];
    }
  }

  await browser.close();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ multiplier, generatedAt: new Date().toISOString(), data: out }, null, 2), 'utf8');
  console.log('\nWrote', outFile);

  // quick comparison with multiplier=1 file if present
  try {
    const file1 = path.resolve(__dirname, 'recipes_1.json');
    if (fs.existsSync(file1)) {
      const base = JSON.parse(fs.readFileSync(file1, 'utf8'));
      const changed = [];
      for (const k of Object.keys(out)) {
        const a = out[k];
        const b = (base.data && base.data[k]) || [];
        // compare recipe names and numeric values
        const mapB = new Map(b.map(r => [r.name, r]));
        for (const r of a) {
          const rb = mapB.get(r.name);
          if (!rb) continue;
          // compare products
          for (const p of r.products) {
            const pb = (rb.products || []).find(x => x.item === p.item);
            if (pb && Math.abs((p.rate||0) - (pb.rate||0)) > 1e-6) {
              changed.push({ title: k, recipe: r.name, item: p.item, before: pb.rate, after: p.rate });
            }
          }
          for (const q of r.ingredients) {
            const qb = (rb.ingredients || []).find(x => x.item === q.item);
            if (qb && Math.abs((q.rate||0) - (qb.rate||0)) > 1e-6) {
              changed.push({ title: k, recipe: r.name, item: q.item, before: qb.rate, after: q.rate });
            }
          }
        }
      }
      console.log('Differences found:', changed.slice(0, 20));
    }
  } catch (e) {
    // ignore
  }

})();