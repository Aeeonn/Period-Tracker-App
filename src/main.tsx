import { render } from 'preact';
import { App } from './ui/app.tsx';
import { Recovery } from './ui/recovery.tsx';
import './ui/styles.css';

render(
  <Recovery>
    <App />
  </Recovery>,
  document.getElementById('app')!,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js');
}

// Ask the browser not to clear her data under storage pressure.
void navigator.storage?.persist?.().catch(() => false);
