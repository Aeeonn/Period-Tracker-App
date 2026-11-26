import { useCallback, useEffect, useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { refreshPartner } from '../../share/sync.ts';
import { useApp } from '../app.tsx';
import { Button, Card } from '../components.tsx';
import { PartnerView } from './partner-view.tsx';

function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function PartnerHome() {
  const { today, share, reload } = useApp();
  const [status, setStatus] = useState<'idle' | 'loading' | 'offline'>('idle');

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      await refreshPartner();
      setStatus('idle');
    } catch {
      setStatus('offline');
    }
    await reload();
  }, [reload]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  if (share?.role !== 'partner') {
    return (
      <Card heading="Not connected">
        <p>Delete everything in Settings and start again to connect.</p>
      </Card>
    );
  }

  async function disconnect() {
    if (!confirm('Disconnect and remove everything she shared from this phone?')) return;
    await storage.deleteEverything();
    location.hash = '';
    await reload();
  }

  return (
    <div class="stack">
      <h1>Her cycle</h1>
      {share.ended ? (
        <Card heading="Sharing has ended">
          <p>She stopped sharing. Nothing she shared is kept on this phone.</p>
          <Button variant="secondary" onClick={() => void disconnect()}>
            Remove connection
          </Button>
        </Card>
      ) : share.lastSnapshot ? (
        <PartnerView snapshot={share.lastSnapshot} today={today} />
      ) : (
        <Card heading="Waiting for her">
          <p>Connected. Her shared data will appear once her phone has sent it.</p>
        </Card>
      )}
      <p class="muted small" role="status">
        {status === 'loading'
          ? 'Checking for updates…'
          : status === 'offline'
            ? 'Could not reach the server. Showing what was saved on this phone.'
            : share.lastSnapshot
              ? `Updated ${ago(share.lastSnapshot.createdAt)}.`
              : ''}
      </p>
      <Button variant="quiet" onClick={() => void refresh()}>
        Refresh
      </Button>
    </div>
  );
}
