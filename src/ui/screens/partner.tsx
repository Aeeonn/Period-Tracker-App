import { useCallback, useEffect, useState } from 'preact/hooks';
import * as storage from '../../data/storage.ts';
import { removePushDevice } from '../../notify/device.ts';
import { refreshPartner } from '../../share/sync.ts';
import { EndedArt, WaitingArt } from '../art.tsx';
import { useApp } from '../app.tsx';
import { Button, EmptyState, PageHeader } from '../components.tsx';
import { RefreshIcon, UnlinkIcon } from '../icons.tsx';
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
      <div class="stack">
        <PageHeader title="Her cycle" />
        <EmptyState art={<WaitingArt />} title="Not connected">
          <p class="muted">Delete everything in Settings and start again to connect.</p>
        </EmptyState>
      </div>
    );
  }

  async function disconnect() {
    if (!confirm('Disconnect and remove everything she shared from this phone?')) return;
    await removePushDevice();
    await storage.deleteEverything();
    location.hash = '';
    await reload();
  }

  const statusText =
    status === 'loading'
      ? 'Checking for updates…'
      : status === 'offline'
        ? 'Could not reach the server. Showing what was saved on this phone.'
        : share.lastSnapshot
          ? `Updated ${ago(share.lastSnapshot.createdAt)}.`
          : '';

  return (
    <div class="stack">
      <PageHeader
        eyebrow="Shared with you"
        title="Her cycle"
        aside={
          <Button
            variant="secondary"
            class="ui-button--compact"
            data-busy={status === 'loading' ? 'true' : undefined}
            onClick={() => void refresh()}
          >
            <RefreshIcon />
            Refresh
          </Button>
        }
      />
      <p
        class="status-line"
        data-state={status === 'loading' ? 'pending' : status === 'offline' ? 'offline' : 'sent'}
        role="status"
      >
        {statusText}
      </p>
      {share.ended ? (
        <EmptyState art={<EndedArt />} title="Sharing has ended">
          <p class="muted">She stopped sharing. Nothing she shared is kept on this phone.</p>
          <Button variant="secondary" block onClick={() => void disconnect()}>
            <UnlinkIcon />
            Remove connection
          </Button>
        </EmptyState>
      ) : share.lastSnapshot ? (
        <PartnerView snapshot={share.lastSnapshot} today={today} />
      ) : (
        <EmptyState art={<WaitingArt />} title="Waiting for her">
          <p class="muted">Connected. Her shared data will appear once her phone has sent it.</p>
        </EmptyState>
      )}
    </div>
  );
}
