window.__floCspFixtureExecuted = true;
window.__floCspFixtureAttempts = ['fetch', 'xhr', 'image', 'worker', 'manifest'];

const forbiddenOrigin = 'https://csp-third-party.invalid';
void fetch(`${forbiddenOrigin}/fetch`).catch(() => undefined);

try {
  const request = new XMLHttpRequest();
  request.open('GET', `${forbiddenOrigin}/xhr`);
  request.send();
} catch {
  // The browser may reject the request synchronously under CSP.
}

const image = new Image();
image.src = `${forbiddenOrigin}/image.png`;

try {
  new Worker(`${forbiddenOrigin}/worker.js`);
} catch {
  // Cross-origin or CSP worker creation may be rejected before a request starts.
}
