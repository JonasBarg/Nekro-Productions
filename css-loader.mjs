// Stub .css imports as empty modules so we can SSR-render in node via tsx.
export async function load(url, ctx, nextLoad) {
  if (url.endsWith('.css')) {
    return new Response('', { headers: { 'Content-Type': 'text/javascript' } });
  }
  return nextLoad(url);
}
