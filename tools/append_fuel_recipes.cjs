const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');
const cheerio = require('cheerio');

function parseNumber(s) {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
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

(async () => {
  const file = path.resolve(__dirname, 'recipes_1.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const api = 'https://satisfactory.wiki.gg/api.php';
    const params = new URLSearchParams({ action: 'parse', page: 'Fuel', prop: 'text', format: 'json' });
    const res = await fetch(api + '?' + params.toString(), { headers: { 'User-Agent': 'satisfactory-crawler/1.0' } });
    const data = await res.json().catch(() => null);
    if (!data || !data.parse || !data.parse.text) {
      console.error('parse missing for Fuel');
      process.exit(1);
    }
    const $ = cheerio.load(data.parse.text['*']);
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
      r.products = r.products.map((p) => ({ item: sanitizeName(p.item), rate: parseNumber(String(p.rate)) }));
      r.ingredients = r.ingredients.map((q) => ({ item: sanitizeName(q.item), rate: parseNumber(String(q.rate)) }));
    }

    json.data = json.data || {};
    json.data['Fuel'] = recipes;
    fs.writeFileSync(file, JSON.stringify(json, null, 2), 'utf8');
    console.log('Appended Fuel recipes:', recipes.map(r => r.name));
  } catch (e) {
    console.error('Error', e.message || e);
    process.exit(1);
  }
})();