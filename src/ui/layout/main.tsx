import { render } from 'preact';
import { App } from './app';

const root = document.getElementById('app');

if (!root) {
  throw new Error('App shell mount point is missing.');
}

render(<App />, root);
