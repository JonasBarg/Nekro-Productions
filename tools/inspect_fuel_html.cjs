const fetch = globalThis.fetch || require('node-fetch');
(async () => {
  const api = 'https://satisfactory.wiki.gg/api.php';
  const params = new URLSearchParams({ action: 'parse', page: 'Fuel', prop: 'text', format: 'json' });
  const res = await fetch(api + '?' + params.toString(), { headers: { 'User-Agent': 'satisfactory-crawler/1.0' } });
  const data = await res.json();
  const html = data.parse.text['*'];
  const keywords = ['multiplier', 'Recipe parts cost', 'Parts cost multiplier', 'select', 'input', 'id="multiplier"', 'name="multiplier"'];
  for (const k of keywords) {
    const idx = html.toLowerCase().indexOf(k.toLowerCase());
    if (idx !== -1) {
      console.log('\n--- Found keyword:', k, 'at', idx, '---');
      console.log(html.slice(Math.max(0, idx - 200), Math.min(html.length, idx + 200)));
    }
  }
})();