import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { applyTitlebarInsets, titlebarInsetsFromRect } from './titlebarInsets';

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function syncWindowControlsOverlay(): void {
  const overlay = navigator.windowControlsOverlay;
  const visible = Boolean(overlay?.visible);
  const rect = overlay?.getTitlebarAreaRect();
  applyTitlebarInsets(
    titlebarInsetsFromRect(
      rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      { width: window.innerWidth, height: window.innerHeight },
      visible,
    ),
  );
  document.documentElement.dataset.displayMode = window.matchMedia(
    '(display-mode: window-controls-overlay)',
  ).matches
    ? 'window-controls-overlay'
    : isStandaloneDisplay()
      ? 'standalone'
      : 'browser';
}

export function usePwaStatus() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const [online, setOnline] = useState(navigator.onLine);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      syncWindowControlsOverlay();
    }

    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('resize', syncWindowControlsOverlay);
    navigator.windowControlsOverlay?.addEventListener('geometrychange', syncWindowControlsOverlay);

    syncWindowControlsOverlay();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('resize', syncWindowControlsOverlay);
      navigator.windowControlsOverlay?.removeEventListener('geometrychange', syncWindowControlsOverlay);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
    }
    setInstallPrompt(null);
  }

  return {
    canInstall: Boolean(installPrompt) && !installed,
    installed,
    online,
    offlineReady,
    needRefresh,
    install,
    dismissOfflineReady: () => setOfflineReady(false),
    dismissNeedRefresh: () => setNeedRefresh(false),
    update: () => updateServiceWorker(true),
  };
}
