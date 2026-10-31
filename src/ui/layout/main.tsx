import { render } from 'preact';
import { AppRuntime } from '../../app/runtime.tsx';

const root = document.getElementById('app');

if (!root) {
  throw new Error('App shell mount point is missing.');
}

render(<AppRuntime />, root);
