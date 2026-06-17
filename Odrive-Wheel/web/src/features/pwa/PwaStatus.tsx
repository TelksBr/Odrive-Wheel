import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';
import { Pill } from '../../shared/ui';
import { usePwaStatus } from './usePwaStatus';

export function PwaStatus({ locale }: { locale: Locale }) {
  const pwa = usePwaStatus();

  if (pwa.needRefresh) {
    return (
      <div className="pwa-status">
        <Pill tone="warn">{translate(locale, 'pwaUpdateReady')}</Pill>
        <button type="button" className="compact-button" onClick={() => void pwa.update()}>
          {translate(locale, 'pwaUpdate')}
        </button>
        <button type="button" className="ghost-button compact-button" onClick={pwa.dismissNeedRefresh}>
          {translate(locale, 'pwaDismiss')}
        </button>
      </div>
    );
  }

  if (pwa.offlineReady) {
    return (
      <div className="pwa-status">
        <Pill tone="ok">{translate(locale, 'pwaOfflineReady')}</Pill>
        <button type="button" className="ghost-button compact-button" onClick={pwa.dismissOfflineReady}>
          {translate(locale, 'pwaDismiss')}
        </button>
      </div>
    );
  }

  return (
    <div className="pwa-status">
      <Pill tone={pwa.online ? 'ok' : 'warn'}>{translate(locale, pwa.online ? 'pwaOnline' : 'pwaOffline')}</Pill>
      {pwa.canInstall ? (
        <button type="button" className="compact-button" onClick={() => void pwa.install()}>
          {translate(locale, 'pwaInstall')}
        </button>
      ) : (
        <Pill>{translate(locale, pwa.installed ? 'pwaInstalled' : 'pwaInstallUnavailable')}</Pill>
      )}
    </div>
  );
}
