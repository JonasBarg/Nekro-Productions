#!/usr/bin/env node
// Crawl Satisfactory Wiki items and extract recipes for a given parts multiplier.
// Usage: node crawl_satisfactory_wiki.cjs --multiplier=1 --out=tools/recipes_1.json

const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const multiplier = Number(argv.multiplier ?? argv.m ?? 1);
const outFile = argv.out ?? `tools/recipes_${multiplier}.json`;

const cheerio = require('cheerio');

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function collectItemLinks() {
  const api = 'https://satisfactory.wiki.gg/api.php';
  const categories = ['Category:Items', 'Category:Fuels'];
  const links = new Set();

  for (const cmtitle of categories) {
    let cmcontinue = undefined;
    do {
      const params = new URLSearchParams({ action: 'query', list: 'categorymembers', cmtitle, cmlimit: '500', format: 'json' });
      if (cmcontinue) params.set('cmcontinue', cmcontinue);
      const url = `${api}?${params.toString()}`;
      let data = null;
      // retry on ratelimit or transient failures
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch(url, { headers: { 'User-Agent': 'satisfactory-crawler/1.0' } });
        try {
          data = await res.json();
        } catch (e) {
          data = null;
        }
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
          // only include articles (namespace 0) and skip localized or variant pages containing '/'
          if (cm.ns === 0 && !cm.title.includes('/')) links.add(cm.title);
        }
      }
      cmcontinue = data.continue && data.continue.cmcontinue;
      // small delay to avoid hammering the API
      await sleep(250);
    } while (cmcontinue);
  }

  return Array.from(links);
}

function parseNumber(s) {
  if (!s) return 0;
  // remove commas, units, and find first number
  const m = s.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

function sanitizeName(s) {
  if (!s || typeof s !== 'string') return s;
  // remove various invisible/non-breaking whitespace characters
  let out = s.replace(/[\u00A0\u202F\u200B\u2060]/g, '');
  out = out.trim();
  // If 'Alternate' appears in the name (possibly attached or followed by suffix),
  // move it to the front as 'Alt: <base> <suffix?>'
  const am = out.match(/^(.*?)\s*Alternate\s*(.*)$/i);
  if (am) {
    const base = am[1].trim();
    const suffix = (am[2] || '').trim();
    out = suffix ? `Alt: ${base} ${suffix}` : `Alt: ${base}`;
  }
  return out;
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

(async () => {
  console.log('Collecting item links via MediaWiki API...');
  const titles = await collectItemLinks();
  console.log(`Found ${titles.length} item pages.`);

  const api = 'https://satisfactory.wiki.gg/api.php';
  const out = {};
  for (let i = 0; i < titles.length; i++) {
    const rawTitle = titles[i];
    const title = sanitizeName(rawTitle);
    try {
      console.log(`Processing [${i + 1}/${titles.length}] ${title}`);
      const params = new URLSearchParams({ action: 'parse', page: rawTitle, prop: 'text', format: 'json' });
      const url = `${api}?${params.toString()}`;
      let data = null;
      // retry parse on transient failures / rate limits
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch(url, { headers: { 'User-Agent': 'satisfactory-crawler/1.0' } });
        try {
          data = await res.json();
        } catch (e) {
          data = null;
        }
        if (data && data.error && data.error.code === 'ratelimited') {
          const wait = 2000 * (attempt + 1);
          console.log('  parse rate limited for', title, '- sleeping', wait, 'ms');
          await sleep(wait);
          continue;
        }
        if (data && data.parse && data.parse.text) break;
        // small backoff before retrying
        await sleep(250 * (attempt + 1));
      }
      if (!data || !data.parse || !data.parse.text) {
        console.log('  parse missing for', title);
        continue;
      }
      const html = data.parse.text['*'];
      const $ = cheerio.load(html);

      const recipes = [];
      $('table.recipetable, table.wikitable.recipetable').each((_, table) => {
        const headers = $(table).find('th').map((i, th) => ($(th).text() || '').trim().toLowerCase()).get();
        const ingredientsIdx = headers.findIndex((t) => /ingredients?/.test(t));
        const productsIdx = headers.findIndex((t) => /products?/.test(t));
        const nameIdx = headers.findIndex((t) => /recipe/.test(t));
        if (ingredientsIdx === -1 && productsIdx === -1) return;

        $(table).find('tr').each((__, tr) => {
          if ($(tr).find('th').length) return; // header row
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
                items.push({ item: name, rate: num });
              });
              return items;
            }
            cell.find('a[title]').each((i, a) => {
              const name = ($(a).attr('title') || $(a).text()).trim();
              const parent = $(a).closest('div');
              const num = parent.find('.item-minute .item-num').text().trim() || '';
              items.push({ item: name, rate: num });
            });
            return items;
          };

          if (ingredientsIdx !== -1) recipe.ingredients = readItemsFromCell(tds.eq(ingredientsIdx));
          if (productsIdx !== -1) recipe.products = readItemsFromCell(tds.eq(productsIdx));

          if ((recipe.products && recipe.products.length) || (recipe.ingredients && recipe.ingredients.length)) recipes.push(recipe);
        });
      });

      // sanitize names inside recipes and post-process numeric rates
      for (const r of recipes) {
        r.name = sanitizeName(r.name);
        r.products = r.products.map((p) => ({ item: sanitizeName(p.item), rate: parseNumber(String(p.rate)) }));
        r.ingredients = r.ingredients.map((q) => ({ item: sanitizeName(q.item), rate: parseNumber(String(q.rate)) }));
      }

      out[title] = recipes;
      console.log(`  ${recipes.length} recipe(s)`);
    } catch (e) {
      console.error('Error processing', title, e.message || e);
    }
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ multiplier, generatedAt: new Date().toISOString(), data: out }, null, 2), 'utf8');
  console.log('Wrote', outFile);
})();
