import { renderToString } from 'react-dom/server';
import { createElement } from 'react';

// Stub browser-only modules that React Flow / lucide might touch at render.
// We just want to know if the component tree throws during the initial render.
import App from './src/App.tsx';

function run() {
  let html: string;
  try {
    html = renderToString(createElement(App));
  } catch (e) {
    console.error('RENDER THREW:', (e as Error)?.stack ?? e);
    process.exit(1);
  }
  console.log('SSR OK, length', html.length);
  // sanity: did we render something?
  console.log('contains "Production" or "Satisfactory":', html.includes('Satisfactory') || html.includes('Production'));
}
run();
