import { Component, type ComponentChildren } from 'preact';
import * as storage from '../data/storage.ts';
import { todayLocal } from '../lib/date.ts';
import { deleteCouple } from '../share/relay-client.ts';
import { Button, Card } from './components.tsx';

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Asks, removes her shared data from the relay when she shares, then wipes this phone. Returns false if she cancelled. */
export async function confirmDeleteEverything(): Promise<boolean> {
  if (!confirm('Delete everything on this phone? This cannot be undone.')) return false;
  const share = await storage.getShare().catch(() => undefined);
  if (share?.role === 'owner') {
    try {
      await deleteCouple(share);
    } catch {
      if (
        !confirm(
          "Could not reach the sharing server, so your shared data stays there and he keeps seeing the last update. Delete this phone's data anyway?",
        )
      )
        return false;
    }
  }
  await storage.deleteEverything();
  location.hash = '';
  return true;
}

/** Last-resort screen, so stored data the app can't handle never locks her out of it. */
export class Recovery extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  override state = { failed: false };

  override componentDidCatch(): void {
    this.setState({ failed: true });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const today = todayLocal();
    return (
      <main class="screen stack">
        <h1>Something went wrong</h1>
        <Card heading="Your data is still on this phone">
          <p>Try reloading. If this keeps happening, export your data, then start fresh.</p>
          <div class="row">
            <Button onClick={() => location.reload()}>Reload</Button>
            <Button
              variant="secondary"
              onClick={() =>
                void storage
                  .exportData(today)
                  .then((data) => download(`flo-${today}.json`, JSON.stringify(data, null, 2)))
              }
            >
              Export
            </Button>
          </div>
          <Button
            variant="danger"
            onClick={() =>
              void confirmDeleteEverything().then((deleted) => {
                if (deleted) location.reload();
              })
            }
          >
            Delete everything on this phone
          </Button>
        </Card>
      </main>
    );
  }
}
