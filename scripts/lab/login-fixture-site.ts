// Lab stand-in for a source that requires login, on loopback :8098. GET /login shows a form,
// POST /login sets a session cookie, and /listings/* serves the recorded Swappa page only to a
// browser holding that cookie (everyone else is redirected to /login). /blocked/* always answers
// 403, to drill how the system degrades when a source blocks it. /swappa/* serves the recorded
// page with no login, in a mode switched at runtime with POST /__mode/<mode>: good; cheaper (first
// card $195 → $149, monitor drills); renamed or renamed-cents (self-heal drills); renamed-then-empty
// (renamed for the failing canary and the trial canary, then no cards — so the post-apply canary
// fails and forces a rollback).
// Usage: npx vite-node scripts/lab/login-fixture-site.ts
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import {
  cheaperSwappaPage,
  emptySwappaPage,
  redesignSwappaPage,
} from '../../tests/fixtures/swappa/redesign';

const page = readFileSync('tests/fixtures/swappa/listings-apple-iphone-13.html', 'utf8');
const SESSION = 'lab-session-7f3a';
const MODES = ['good', 'cheaper', 'renamed', 'renamed-cents', 'renamed-then-empty'] as const;
let swappaMode: (typeof MODES)[number] = 'good';
let swappaRequests = 0;

const swappaPage = () => {
  swappaRequests += 1;
  if (swappaMode === 'good') return page;
  if (swappaMode === 'cheaper') return cheaperSwappaPage(page);
  if (swappaMode === 'renamed-then-empty')
    return swappaRequests <= 2 ? redesignSwappaPage(page, 'renamed') : emptySwappaPage(page);
  return redesignSwappaPage(page, swappaMode);
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:8098');
  const loggedIn = (request.headers.cookie ?? '').includes(`sid=${SESSION}`);
  if (url.pathname === '/robots.txt') return response.end('User-agent: *\nDisallow: /cgi-bin/\n');
  // Simulates a source that starts blocking the collector (resilience drills).
  if (url.pathname.startsWith('/blocked/')) {
    console.log(`blocked request ${url.pathname}`);
    response.writeHead(403, { 'Content-Type': 'text/html' });
    return response.end('<html>Access denied</html>');
  }
  const mode = /^\/__mode\/([a-z-]+)$/.exec(url.pathname)?.[1];
  if (mode && request.method === 'POST') {
    if (!MODES.includes(mode as (typeof MODES)[number])) {
      response.writeHead(400);
      return response.end('unknown mode');
    }
    swappaMode = mode as (typeof MODES)[number];
    swappaRequests = 0;
    console.log(`swappa mode ${swappaMode}`);
    return response.end(swappaMode);
  }
  if (url.pathname.startsWith('/swappa/listings/')) {
    console.log(`swappa ${swappaMode} request ${swappaRequests + 1}`);
    response.writeHead(200, { 'Content-Type': 'text/html' });
    return response.end(swappaPage());
  }
  if (url.pathname === '/login' && request.method === 'POST') {
    response.writeHead(302, {
      'Set-Cookie': `sid=${SESSION}; HttpOnly; Path=/; Max-Age=86400`,
      Location: '/account',
    });
    return response.end();
  }
  if (url.pathname === '/login') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    return response.end(
      '<form method="post" action="/login"><input name="user"><input type="password" name="pass"><button>Entrar</button></form>',
    );
  }
  if (!loggedIn) {
    response.writeHead(302, { Location: '/login' });
    return response.end();
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    url.pathname.startsWith('/listings/') ? page : '<html><body>Minha conta</body></html>',
  );
}).listen(8098, '127.0.0.1', () => console.log('login fixture site on http://127.0.0.1:8098'));
