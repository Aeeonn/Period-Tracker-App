import jsQR from 'jsqr';

type ResultState = 'untested' | 'not-configured' | 'unsupported' | 'successful' | 'failed';
type ProbeResult = { state: ResultState; summary: string };
type LaunchMarker = { key: 'synthetic-launch-marker'; visits: number };
type PasskeyPrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
type PushWorkerEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type PushWorkerScope = EventTarget & {
  registration: ServiceWorkerRegistration;
  addEventListener(type: 'push', listener: (event: PushWorkerEvent) => void): void;
};

const QR_PAYLOAD = 'SYNTHETIC-PROBE-V1';
const QR_MATRIX = [
  '111111100101101111111',
  '100000101101001000001',
  '101110101100101011101',
  '101110100101001011101',
  '101110101000101011101',
  '100000101001101000001',
  '111111101010101111111',
  '000000001111100000000',
  '110100110110001110110',
  '010010011111010001111',
  '010100100110111010100',
  '100000011110011001011',
  '000110110010111111101',
  '000000001111000111010',
  '111111101010110111110',
  '100000100100110110100',
  '101110100001111010110',
  '101110101001000000011',
  '101110100001011110001',
  '100000101000110010101',
  '111111101110000001000',
];

declare global {
  interface ImportMetaEnv {
    readonly VITE_PREVIEW_PUSH_URL?: string;
    readonly VITE_PREVIEW_VAPID_PUBLIC_KEY?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const isPushWorker = typeof document === 'undefined' && 'registration' in globalThis;

if (isPushWorker) {
  const worker = globalThis as unknown as PushWorkerScope;
  worker.addEventListener('push', (event) => {
    event.waitUntil(
      worker.registration.showNotification('Synthetic probe test', {
        body: 'This is a synthetic notification test.',
        tag: 'synthetic-probe-test',
      }),
    );
  });
} else {
  initializeProbe();
}

function initializeProbe(): void {
  const results = new Map<string, ProbeResult>();
  const pushUrlInput = import.meta.env.VITE_PREVIEW_PUSH_URL?.trim() ?? '';
  const vapidInput = import.meta.env.VITE_PREVIEW_VAPID_PUBLIC_KEY?.trim() ?? '';
  const pushUrl = parseApprovedPushUrl(pushUrlInput);
  const pushVapidKey = decodeBase64Url(vapidInput);
  const canRunPush = pushUrl !== null && pushVapidKey !== null;

  for (const item of document.querySelectorAll<HTMLElement>('[data-result]')) {
    const key = item.dataset.result;
    if (key) results.set(key, { state: 'untested', summary: 'Not run.' });
  }

  setResult(
    'storage',
    'untested',
    'Run the check to request persistence, inspect the approximate quota, and write then reopen a synthetic marker.',
  );
  setResult(
    'files',
    'untested',
    'Share or download synthetic .json, .csv, and .flobak fixtures, then choose one to re-import.',
  );
  setResult('camera', 'untested', 'Camera permission is not requested until you start the scan.');
  setResult('passkey', 'untested', 'No passkey operation has been requested.');
  setResult('pbkdf2', 'untested', 'No derivation has been run.');

  const pushButton = button('run-push');
  if (!canRunPush) {
    if (pushButton) pushButton.disabled = true;
    setResult(
      'push',
      'not-configured',
      'The approved preview push endpoint and public VAPID key have not been supplied. No permission prompt or network request was made.',
    );
  } else {
    setResult(
      'push',
      'untested',
      'A preview endpoint is configured. Press the button to request notification permission and send one synthetic test; no action happens automatically.',
    );
  }

  drawSyntheticQr();
  void inspectPriorStorageMarker();
  void bindStorageCheck();
  bindFileControls();
  bindCameraControls();
  bindPushControls();
  bindPasskeyControls();
  bindPbkdf2Control();
  bindCopyControl();

  function setResult(key: string, state: ResultState, summary: string): void {
    results.set(key, { state, summary });
    const row = document.querySelector<HTMLElement>(`[data-result="${key}"]`);
    const badge = row?.querySelector<HTMLElement>('.status');
    const detail = row?.querySelector<HTMLElement>('.detail');
    if (!row || !badge || !detail) return;
    badge.dataset.status = state;
    badge.textContent = labelFor(state);
    detail.textContent = summary;
  }

  async function inspectPriorStorageMarker(): Promise<void> {
    if (!('indexedDB' in window)) return;
    try {
      const marker = await readLaunchMarker();
      if (marker) {
        setResult(
          'storage',
          'untested',
          `A synthetic marker from an earlier probe run is present (${marker.visits} recorded runs). Run the check to write and reopen it again.`,
        );
      }
    } catch {
      // Leave the check untested; the explicit storage action reports the failure.
    }
  }

  async function bindStorageCheck(): Promise<void> {
    button('run-storage')?.addEventListener('click', async () => {
      const storageManager = navigator.storage;
      let persistOutcome = 'unsupported';
      let estimateOutcome = 'unsupported';
      let estimateText = 'quota estimate unavailable';
      if (storageManager?.persist && storageManager.persisted) {
        try {
          const alreadyPersistent = await storageManager.persisted();
          const granted = alreadyPersistent || (await storageManager.persist());
          persistOutcome = granted ? 'granted' : 'not granted';
        } catch {
          persistOutcome = 'request failed';
        }
      }
      if (storageManager?.estimate) {
        try {
          const estimate = await storageManager.estimate();
          const quota = roundedMiB(estimate.quota);
          const usage = roundedMiB(estimate.usage);
          estimateOutcome = 'available';
          estimateText = `approximate usage ${usage}; approximate quota ${quota}`;
        } catch {
          estimateOutcome = 'request failed';
        }
      }
      try {
        const oldMarker = await readLaunchMarker();
        const visits = (oldMarker?.visits ?? 0) + 1;
        await writeLaunchMarker({ key: 'synthetic-launch-marker', visits });
        const reopened = await readLaunchMarker();
        if (!reopened || reopened.key !== 'synthetic-launch-marker' || reopened.visits !== visits) {
          throw new Error('read-back mismatch');
        }
        const priorMarker = oldMarker
          ? 'A marker from a prior run was read before this run.'
          : 'No prior marker was present before this run.';
        setResult(
          'storage',
          'successful',
          `IndexedDB write, close, reopen, and read-back succeeded. ${priorMarker} Storage persistence: ${persistOutcome}; estimate: ${estimateOutcome} (${estimateText}). This browser result does not prove force-quit, reboot, or long-term phone retention.`,
        );
      } catch {
        setResult(
          'storage',
          'failed',
          `IndexedDB write or read-back failed. Storage persistence: ${persistOutcome}; estimate: ${estimateOutcome} (${estimateText}). No raw browser error or device identifier is included.`,
        );
      }
    });
  }

  function bindFileControls(): void {
    document.querySelectorAll<HTMLButtonElement>('.download-file').forEach((control) => {
      control.addEventListener('click', () => {
        const format = control.dataset.format;
        if (format !== 'json' && format !== 'csv' && format !== 'flobak') return;
        try {
          const file = syntheticFile(format);
          const url = URL.createObjectURL(file);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          link.rel = 'noopener';
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setResult(
            'files',
            'successful',
            `The browser was asked to download a synthetic .${format} fixture. The page cannot confirm it was saved. Re-import a selected fixture to test reading.`,
          );
        } catch {
          setResult(
            'files',
            'failed',
            `The synthetic .${format} download could not be started. The page cannot confirm where a file was saved.`,
          );
        }
      });
    });

    button('share-files')?.addEventListener('click', async () => {
      const files = [syntheticFile('json'), syntheticFile('csv'), syntheticFile('flobak')];
      if (!navigator.share || !navigator.canShare?.({ files })) {
        setResult(
          'files',
          'unsupported',
          'This browser does not report support for sharing these synthetic files. Try the separate download controls.',
        );
        return;
      }
      try {
        await navigator.share({ files, title: 'Synthetic probe fixtures' });
        setResult(
          'files',
          'successful',
          'The native share sheet accepted the synthetic files. Handoff does not prove a durable save at a particular destination.',
        );
      } catch (error) {
        if (isAbortError(error)) {
          setResult(
            'files',
            'untested',
            'The share sheet was dismissed; no successful handoff was confirmed.',
          );
        } else {
          setResult(
            'files',
            'failed',
            'The browser could not hand the synthetic files to the share sheet.',
          );
        }
      }
    });

    const importInput = document.querySelector<HTMLInputElement>('#import-file');
    importInput?.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      if (file.size > 128 * 1024) {
        setResult(
          'files',
          'failed',
          'The selected file is larger than this synthetic fixture reader accepts.',
        );
        importInput.value = '';
        return;
      }
      try {
        const text = await file.text();
        const extension = file.name.toLowerCase().split('.').pop();
        const valid =
          extension === 'json'
            ? validateJsonFixture(text)
            : extension === 'flobak'
              ? validateBackupFixture(text)
              : extension === 'csv'
                ? validateCsvFixture(text)
                : false;
        setResult(
          'files',
          valid ? 'successful' : 'failed',
          valid
            ? 'A synthetic fixture was re-imported and its format marker was verified. This is a probe fixture, not an application backup.'
            : 'The selected file did not match a supported synthetic fixture format. Its contents were not displayed or copied.',
        );
      } catch {
        setResult(
          'files',
          'failed',
          'The selected file could not be read as a synthetic fixture. Its contents were not displayed or copied.',
        );
      } finally {
        importInput.value = '';
      }
    });
  }

  function bindCameraControls(): void {
    const start = button('start-camera');
    const stop = button('stop-camera');
    const video = document.querySelector<HTMLVideoElement>('#camera-preview');
    const frameCanvas = document.querySelector<HTMLCanvasElement>('#camera-frame');
    const frameContext = frameCanvas?.getContext('2d', { willReadFrequently: true });
    let stream: MediaStream | null = null;
    let scanHandle = 0;
    let scanTimeout = 0;

    const stopCamera = (): void => {
      if (scanHandle) cancelAnimationFrame(scanHandle);
      if (scanTimeout) window.clearTimeout(scanTimeout);
      scanHandle = 0;
      scanTimeout = 0;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (video) {
        video.pause();
        video.srcObject = null;
        video.style.display = 'none';
      }
      if (stop) stop.disabled = true;
      if (start) start.disabled = false;
    };

    stop?.addEventListener('click', () => {
      stopCamera();
      setResult(
        'camera',
        'untested',
        'Camera scan stopped by the user before a matching synthetic QR was read.',
      );
    });

    start?.addEventListener('click', async () => {
      if (!navigator.mediaDevices?.getUserMedia || !video || !frameCanvas || !frameContext) {
        setResult(
          'camera',
          'unsupported',
          'This browser does not provide the camera capture APIs needed for the test.',
        );
        return;
      }
      start.disabled = true;
      setResult('camera', 'untested', 'Waiting for the browser camera permission decision.');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        video.srcObject = stream;
        video.style.display = 'block';
        if (stop) stop.disabled = false;
        await video.play();
        setResult(
          'camera',
          'untested',
          'Camera is active. Point it at the synthetic QR displayed on a second screen; the camera will stop after a match or timeout.',
        );
        scanTimeout = window.setTimeout(() => {
          stopCamera();
          setResult(
            'camera',
            'failed',
            'No matching synthetic QR was read before the scan timed out. Camera access has been stopped.',
          );
        }, 30_000);

        const scan = (): void => {
          if (!stream || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            scanHandle = requestAnimationFrame(scan);
            return;
          }
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) {
            scanHandle = requestAnimationFrame(scan);
            return;
          }
          frameCanvas.width = width;
          frameCanvas.height = height;
          frameContext.drawImage(video, 0, 0, width, height);
          const image = frameContext.getImageData(0, 0, width, height);
          const decoded = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
          if (decoded) {
            stopCamera();
            if (decoded.data === QR_PAYLOAD) {
              setResult(
                'camera',
                'successful',
                'The camera decoded the exact synthetic QR payload. Camera access has been stopped; this does not establish behavior on other devices.',
              );
            } else {
              setResult(
                'camera',
                'failed',
                'A QR code was decoded, but it did not match the synthetic test payload. Camera access has been stopped.',
              );
            }
            return;
          }
          scanHandle = requestAnimationFrame(scan);
        };
        scanHandle = requestAnimationFrame(scan);
      } catch (error) {
        stopCamera();
        setResult(
          'camera',
          'failed',
          isAbortError(error)
            ? 'Camera access was cancelled or denied. No raw browser error is retained.'
            : 'The camera could not be started. Check browser permission and secure-context requirements; no raw error is retained.',
        );
      }
    });
  }

  function bindPushControls(): void {
    const run = button('run-push');
    const confirm = button('confirm-push');
    const missed = button('missed-push');
    if (!run || !canRunPush || !pushUrl || !pushVapidKey) return;

    run.addEventListener('click', async () => {
      run.disabled = true;
      if (!pushUrl || !pushVapidKey) {
        setResult(
          'push',
          'not-configured',
          'The approved endpoint or public VAPID key is absent. No permission prompt or request was made.',
        );
        run.disabled = false;
        return;
      }
      if (
        !window.isSecureContext ||
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        setResult(
          'push',
          'unsupported',
          'This browser context does not expose the notification, service-worker, and push APIs required by the test.',
        );
        run.disabled = false;
        return;
      }
      try {
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setResult(
            'push',
            'failed',
            'Notification permission was not granted. No test push request was sent.',
          );
          run.disabled = false;
          return;
        }
        const registration = await navigator.serviceWorker.register(import.meta.url, {
          type: 'module',
        });
        await waitForActiveServiceWorker(registration);
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: pushVapidKey,
          });
        }
        setResult(
          'push',
          'untested',
          'Permission is granted and a synthetic push test is being sent to the configured preview endpoint.',
        );
        const response = await fetch(pushUrl.href, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        if (!response.ok) {
          setResult(
            'push',
            'failed',
            `The preview endpoint did not accept the synthetic push request (HTTP ${response.status}). No response body or subscription details were retained.`,
          );
          return;
        }
        setResult(
          'push',
          'untested',
          'The preview endpoint accepted the request. Delivery is not verified; confirm only if the fixed generic notification visibly appeared on this device.',
        );
        if (confirm) confirm.hidden = false;
        if (missed) missed.hidden = false;
      } catch (error) {
        setResult(
          'push',
          'failed',
          isAbortError(error)
            ? 'The permission or push action was cancelled. No push request was confirmed.'
            : 'The synthetic push test could not complete. The endpoint, browser permission, service worker, and VAPID setup may need review; raw errors are not retained.',
        );
      } finally {
        run.disabled = false;
      }
    });

    confirm?.addEventListener('click', () => {
      setResult(
        'push',
        'successful',
        'You confirmed that the configured preview push produced its fixed generic notification on this device. This is one observation, not a delivery guarantee.',
      );
      confirm.hidden = true;
      if (missed) missed.hidden = true;
    });
    missed?.addEventListener('click', () => {
      setResult(
        'push',
        'failed',
        'The endpoint accepted the request, but you did not observe the notification on this device.',
      );
      if (confirm) confirm.hidden = true;
      missed.hidden = true;
    });
  }

  function bindPasskeyControls(): void {
    const consent = document.querySelector<HTMLInputElement>('#passkey-consent');
    const run = button('run-passkey');
    const retry = button('retry-offline');
    const offlineConfirm = document.querySelector<HTMLInputElement>('#offline-confirm');
    let prfSalt: Uint8Array<ArrayBuffer> | null = null;
    let comparisonDigest: Uint8Array<ArrayBuffer> | null = null;

    const clearComparison = (): void => {
      prfSalt?.fill(0);
      comparisonDigest?.fill(0);
      prfSalt = null;
      comparisonDigest = null;
      if (retry) retry.disabled = true;
    };

    consent?.addEventListener('change', () => {
      if (run) run.disabled = !consent.checked;
    });
    window.addEventListener('pagehide', clearComparison, { once: true });

    run?.addEventListener('click', async () => {
      if (!consent?.checked) return;
      if (
        !window.isSecureContext ||
        !navigator.credentials?.create ||
        !navigator.credentials.get ||
        typeof PublicKeyCredential === 'undefined'
      ) {
        setResult(
          'passkey',
          'unsupported',
          'WebAuthn passkey APIs are unavailable in this browser context.',
        );
        return;
      }
      run.disabled = true;
      clearComparison();
      try {
        const salt = randomBytes(32);
        const createExtensions = {
          prf: { eval: { first: salt } },
        } as unknown as AuthenticationExtensionsClientInputs;
        const created = await navigator.credentials.create({
          publicKey: {
            rp: { name: 'Synthetic feasibility probe', id: location.hostname },
            user: {
              id: randomBytes(16),
              name: 'synthetic-probe',
              displayName: 'Synthetic feasibility probe',
            },
            challenge: randomBytes(32),
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
            timeout: 60_000,
            extensions: createExtensions,
          },
        });
        if (!(created instanceof PublicKeyCredential))
          throw new Error('credential creation did not return a public key credential');
        const getExtensions = {
          prf: { eval: { first: salt } },
        } as unknown as AuthenticationExtensionsClientInputs;
        const assertion = await navigator.credentials.get({
          publicKey: {
            rpId: location.hostname,
            challenge: randomBytes(32),
            allowCredentials: [{ type: 'public-key', id: created.rawId }],
            userVerification: 'required',
            timeout: 60_000,
            extensions: getExtensions,
          },
        });
        if (!(assertion instanceof PublicKeyCredential))
          throw new Error('credential assertion did not return a public key credential');
        const extensionResults = assertion.getClientExtensionResults() as PasskeyPrfResults;
        const output = extensionResults.prf?.results?.first;
        if (!output || output.byteLength === 0) {
          salt.fill(0);
          setResult(
            'passkey',
            'unsupported',
            'Passkey create/get completed, but this authenticator did not return WebAuthn PRF output. The synthetic passkey may remain in the authenticator.',
          );
          return;
        }
        const outputBytes = new Uint8Array(output);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', outputBytes));
        const offlineSalt = new Uint8Array(salt);
        outputBytes.fill(0);
        salt.fill(0);
        prfSalt = offlineSalt;
        comparisonDigest = digest;
        if (retry) retry.disabled = false;
        setResult(
          'passkey',
          'successful',
          'Passkey create/get and PRF output succeeded. Only a one-way comparison digest and synthetic salt remain in page memory for the offline retry; neither is written to storage or copied.',
        );
      } catch (error) {
        clearComparison();
        setResult(
          'passkey',
          isNotSupportedError(error) ? 'unsupported' : 'failed',
          isAbortError(error)
            ? 'Passkey creation or assertion was cancelled. The authenticator may retain a synthetic credential created before cancellation; no raw identifier or error is shown.'
            : 'Passkey create/get did not complete. Browser, authenticator, secure-context, or PRF support may be unavailable; no raw error is retained.',
        );
      } finally {
        run.disabled = !consent?.checked;
      }
    });

    retry?.addEventListener('click', async () => {
      if (!prfSalt || !comparisonDigest) {
        setResult(
          'passkey',
          'untested',
          'Run the create/get test in this page first. The page does not persist comparison material across visits.',
        );
        return;
      }
      if (!offlineConfirm?.checked || navigator.onLine) {
        setResult(
          'passkey',
          'untested',
          'Disconnect the device and confirm offline mode before retrying; no retry was made.',
        );
        return;
      }
      retry.disabled = true;
      try {
        const extensions = {
          prf: { eval: { first: prfSalt } },
        } as unknown as AuthenticationExtensionsClientInputs;
        const assertion = await navigator.credentials.get({
          publicKey: {
            rpId: location.hostname,
            challenge: randomBytes(32),
            userVerification: 'required',
            timeout: 60_000,
            extensions,
          },
        });
        if (!(assertion instanceof PublicKeyCredential))
          throw new Error('offline assertion unavailable');
        const extensionResults = assertion.getClientExtensionResults() as PasskeyPrfResults;
        const output = extensionResults.prf?.results?.first;
        if (!output || output.byteLength === 0) throw new Error('offline PRF output unavailable');
        const outputBytes = new Uint8Array(output);
        const retryDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', outputBytes));
        outputBytes.fill(0);
        const matches = constantTimeEqual(retryDigest, comparisonDigest);
        retryDigest.fill(0);
        offlineConfirm.checked = false;
        if (matches) {
          setResult(
            'passkey',
            'successful',
            'A discoverable passkey assertion returned the same PRF result while the browser reported offline. The comparison used only transient in-memory digest state; this does not prove restored-device behavior.',
          );
        } else {
          setResult(
            'passkey',
            'failed',
            'The offline retry did not reproduce the prior PRF result. Comparison material was cleared; run create/get again before another retry.',
          );
          clearComparison();
        }
      } catch (error) {
        if (offlineConfirm) offlineConfirm.checked = false;
        setResult(
          'passkey',
          'failed',
          isAbortError(error)
            ? 'The offline passkey retry was cancelled. No key material or credential identifier was copied.'
            : 'The offline passkey retry did not complete or returned no matching PRF result. No raw error is retained.',
        );
      } finally {
        if (comparisonDigest && retry) retry.disabled = false;
      }
    });
  }

  function bindPbkdf2Control(): void {
    button('run-pbkdf2')?.addEventListener('click', async () => {
      if (!crypto.subtle?.deriveBits) {
        setResult(
          'pbkdf2',
          'unsupported',
          'WebCrypto PBKDF2 is unavailable in this browser context.',
        );
        return;
      }
      const control = button('run-pbkdf2');
      if (control) control.disabled = true;
      const password = new TextEncoder().encode('synthetic probe passphrase only');
      const salt = randomBytes(16);
      const start = performance.now();
      try {
        const material = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, [
          'deriveBits',
        ]);
        const derived = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
          material,
          256,
        );
        new Uint8Array(derived).fill(0);
        const elapsed = performance.now() - start;
        setResult(
          'pbkdf2',
          'successful',
          `One PBKDF2-SHA-256 derivation at 600,000 iterations took ${elapsed.toFixed(1)} ms in this browser. This is not an iPhone measurement; the output and synthetic input were discarded.`,
        );
      } catch {
        setResult(
          'pbkdf2',
          'failed',
          'The local PBKDF2 derivation failed. The raw browser error and derived material are not retained.',
        );
      } finally {
        password.fill(0);
        salt.fill(0);
        if (control) control.disabled = false;
      }
    });
  }

  function bindCopyControl(): void {
    button('copy-results')?.addEventListener('click', async () => {
      const summary = [...results.entries()]
        .map(([key, result]) => `${key}: ${labelFor(result.state)} — ${result.summary}`)
        .join('\n');
      const status = document.querySelector<HTMLElement>('#copy-status');
      try {
        await navigator.clipboard.writeText(summary);
        if (status)
          status.textContent = 'Status summary copied. It omits device and credential identifiers.';
      } catch {
        if (status)
          status.textContent =
            'Clipboard access was unavailable. Select the visible statuses manually; no identifiers are shown.';
      }
    });
  }

  function button(id: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(`#${id}`);
  }
}

function drawSyntheticQr(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#qr-fixture');
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  const moduleSize = 8;
  const quietZone = 4;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  QR_MATRIX.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '1')
        context.fillRect(
          (x + quietZone) * moduleSize,
          (y + quietZone) * moduleSize,
          moduleSize,
          moduleSize,
        );
    });
  });
}

function labelFor(state: ResultState): string {
  switch (state) {
    case 'not-configured':
      return 'Not configured';
    case 'unsupported':
      return 'Unsupported';
    case 'successful':
      return 'Successful';
    case 'failed':
      return 'Failed';
    case 'untested':
      return 'Untested';
  }
}

function parseApprovedPushUrl(value: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.pathname.endsWith('/push-test') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const output = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
    return output.length === 65 ? output : null;
  } catch {
    return null;
  }
}

async function waitForActiveServiceWorker(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active?.state === 'activated') return;
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error('service worker is not installing or active');
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener('statechange', checkState);
      reject(new Error('service worker activation timed out'));
    }, 10_000);
    const checkState = (): void => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        worker.removeEventListener('statechange', checkState);
        resolve();
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timeout);
        worker.removeEventListener('statechange', checkState);
        reject(new Error('service worker installation failed'));
      }
    };
    worker.addEventListener('statechange', checkState);
    checkState();
  });
}

function randomBytes(size: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(size)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function roundedMiB(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'not reported';
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

function syntheticFile(format: 'json' | 'csv' | 'flobak'): File {
  if (format === 'csv') {
    return new File(
      ['synthetic,label,value\ntrue,Synthetic sample,only\n'],
      'synthetic-probe.csv',
      { type: 'text/csv' },
    );
  }
  const payload =
    format === 'json'
      ? {
          synthetic: true,
          format: 'probe-json-v1',
          records: [{ label: 'Synthetic sample', value: 'only' }],
        }
      : { synthetic: true, format: 'probe-flobak-fixture-v1', payload: { sample: 'only' } };
  return new File(
    [JSON.stringify(payload)],
    format === 'json' ? 'synthetic-probe.json' : 'synthetic-probe.flobak',
    { type: format === 'json' ? 'application/json' : 'application/octet-stream' },
  );
}

function validateJsonFixture(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return (
      typeof value === 'object' &&
      value !== null &&
      'synthetic' in value &&
      value.synthetic === true &&
      'format' in value &&
      value.format === 'probe-json-v1'
    );
  } catch {
    return false;
  }
}

function validateBackupFixture(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return (
      typeof value === 'object' &&
      value !== null &&
      'synthetic' in value &&
      value.synthetic === true &&
      'format' in value &&
      value.format === 'probe-flobak-fixture-v1'
    );
  } catch {
    return false;
  }
}

function validateCsvFixture(text: string): boolean {
  const lines = text.trim().split(/\r?\n/);
  return (
    lines.length === 2 &&
    lines[0] === 'synthetic,label,value' &&
    lines[1] === 'true,Synthetic sample,only'
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'NotAllowedError')
  );
}

function isNotSupportedError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotSupportedError' || error.name === 'InvalidStateError')
  );
}

async function openProbeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('synthetic-feasibility-probe-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('markers'))
        request.result.createObjectStore('markers', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function readLaunchMarker(): Promise<LaunchMarker | null> {
  const database = await openProbeDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('markers', 'readonly');
      const request = transaction.objectStore('markers').get('synthetic-launch-marker');
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (
          typeof value === 'object' &&
          value !== null &&
          'key' in value &&
          value.key === 'synthetic-launch-marker' &&
          'visits' in value &&
          typeof value.visits === 'number'
        ) {
          resolve({ key: 'synthetic-launch-marker', visits: value.visits });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB read transaction aborted'));
    });
  } finally {
    database.close();
  }
}

async function writeLaunchMarker(marker: LaunchMarker): Promise<void> {
  const database = await openProbeDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('markers', 'readwrite');
      transaction.objectStore('markers').put(marker);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
    });
  } finally {
    database.close();
  }
}
