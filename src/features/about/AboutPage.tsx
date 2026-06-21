import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, SectionHeader } from '../../shared/ui';
import { AppIcon } from '../../shared/ui/AppIcon';

import { FIRMWARE_UPSTREAM_URL, LEGACY_HTML_TOOL_URL } from '../../app/brand';

const ORIGINAL_REPO = FIRMWARE_UPSTREAM_URL;
const HOSTED_HTML = LEGACY_HTML_TOOL_URL;
const ODRIVE_REPO = 'https://github.com/odriverobotics/ODrive';
const OPENFF_REPO = 'https://github.com/Ultrawipf/OpenFFBoard';
const SPONSOR_URL = 'https://github.com/sponsors/eagabriel';
const TELEGRAM_URL = 'https://t.me/telks13';

export function AboutPage() {
  const { state } = useAppState();
  const locale = state.locale;

  return (
    <div className="about-page">
      <SectionHeader
        eyebrow={translate(locale, 'aboutEyebrow')}
        title={translate(locale, 'aboutTitle')}
        description={translate(locale, 'aboutSubtitle')}
      />

      <div className="about-grid">
        <Card title={translate(locale, 'aboutCreditsTitle')}>
          <p className="about-lead">{translate(locale, 'aboutCreditsBody')}</p>
          <ul className="about-links">
            <li>
              <a href={ORIGINAL_REPO} target="_blank" rel="noreferrer" className="about-link-with-icon">
                <AppIcon id="github-icon" size={16} />
                {translate(locale, 'aboutCreditsFirmware')}
              </a>
            </li>
            <li>
              <a href={`${ORIGINAL_REPO}/blob/main/Odrive-Wheel/tools/odrive-wheel.html`} target="_blank" rel="noreferrer" className="about-link-with-icon">
                <AppIcon id="documentation-icon" size={16} />
                {translate(locale, 'aboutCreditsHtmlTool')}
              </a>
            </li>
            <li>
              <a href={HOSTED_HTML} target="_blank" rel="noreferrer" className="about-link-with-icon">
                <AppIcon id="documentation-icon" size={16} />
                {translate(locale, 'aboutCreditsHosted')}
              </a>
            </li>
            <li>
              <a href={SPONSOR_URL} target="_blank" rel="noreferrer" className="about-link-with-icon">
                <AppIcon id="social-icon" size={16} />
                {translate(locale, 'aboutCreditsSponsor')} ↗
              </a>
            </li>
          </ul>
        </Card>

        <Card title={translate(locale, 'aboutContactTitle')}>
          <p className="about-lead">{translate(locale, 'aboutContactBody')}</p>
          <ul className="about-links">
            <li>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="about-link-with-icon">
                <AppIcon id="social-icon" size={16} />
                {translate(locale, 'aboutTelegram')}
              </a>
            </li>
          </ul>
        </Card>

        <Card title={translate(locale, 'aboutLineageTitle')}>
          <ul className="about-list">
            <li>
              <a href={ODRIVE_REPO} target="_blank" rel="noreferrer">ODrive</a>
              {' — '}
              {translate(locale, 'aboutLineageOdrive')}
            </li>
            <li>
              <a href={OPENFF_REPO} target="_blank" rel="noreferrer">OpenFFBoard</a>
              {' — '}
              {translate(locale, 'aboutLineageOpenFF')}
            </li>
            <li>{translate(locale, 'aboutLineageBridge')}</li>
          </ul>
        </Card>

        <Card title={translate(locale, 'aboutLicenseTitle')}>
          <p className="about-lead">{translate(locale, 'aboutLicenseBody')}</p>
        </Card>
      </div>
    </div>
  );
}
