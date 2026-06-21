import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, Pill, SectionHeader } from '../../shared/ui';
import { AppIcon } from '../../shared/ui/AppIcon';

import { FIRMWARE_UPSTREAM_URL, LEGACY_HTML_TOOL_URL } from '../../app/brand';

const ORIGINAL_REPO = FIRMWARE_UPSTREAM_URL;
const HOSTED_HTML = LEGACY_HTML_TOOL_URL;
const ODRIVE_REPO = 'https://github.com/odriverobotics/ODrive';
const OPENFF_REPO = 'https://github.com/Ultrawipf/OpenFFBoard';
const SPONSOR_URL = 'https://github.com/sponsors/eagabriel';

type ProposalStatus = 'done' | 'next' | 'future';

interface ProposalItem {
  key: string;
  status: ProposalStatus;
}

const PROPOSAL_ITEMS: ProposalItem[] = [
  { key: 'aboutPropDashboard', status: 'done' },
  { key: 'aboutPropSave', status: 'done' },
  { key: 'aboutPropTune', status: 'done' },
  { key: 'aboutPropInputs', status: 'done' },
  { key: 'aboutPropTelemetry', status: 'done' },
  { key: 'aboutPropObserve', status: 'done' },
  { key: 'aboutPropOverlay', status: 'done' },
  { key: 'aboutPropPerfTest', status: 'done' },
  { key: 'aboutPropProfiles', status: 'next' },
  { key: 'aboutPropOnboarding', status: 'next' },
];

const STATUS_TONE: Record<ProposalStatus, 'ok' | 'warn' | 'neutral'> = {
  done: 'ok',
  next: 'warn',
  future: 'neutral',
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  done: 'aboutProposalStatusDone',
  next: 'aboutProposalStatusNext',
  future: 'aboutProposalStatusFuture',
};

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

        <Card title={translate(locale, 'aboutWebTitle')}>
          <ul className="about-list about-list--checks">
            <li>{translate(locale, 'aboutWebPwa')}</li>
            <li>{translate(locale, 'aboutWebSerial')}</li>
            <li>{translate(locale, 'aboutWebWorkspaces')}</li>
            <li>{translate(locale, 'aboutWebGuidance')}</li>
            <li>{translate(locale, 'aboutWebLive')}</li>
          </ul>
        </Card>

        <Card
          title={translate(locale, 'aboutProposalTitle')}
          description={translate(locale, 'aboutProposalIntro')}
        >
          <div className="about-proposal">
            <div className="about-proposal-compare">
              <div className="about-proposal-col">
                <span className="eyebrow">{translate(locale, 'aboutCompareHtmlLabel')}</span>
                <p>{translate(locale, 'aboutCompareHtmlText')}</p>
              </div>
              <div className="about-proposal-col about-proposal-col--accent">
                <span className="eyebrow">{translate(locale, 'aboutComparePwaLabel')}</span>
                <p>{translate(locale, 'aboutComparePwaText')}</p>
              </div>
            </div>

            <ul className="about-proposal-items">
              {PROPOSAL_ITEMS.map((item) => (
                <li key={item.key}>
                  <Pill tone={STATUS_TONE[item.status]}>
                    {translate(locale, STATUS_LABEL[item.status])}
                  </Pill>
                  <span>{translate(locale, item.key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title={translate(locale, 'aboutLicenseTitle')}>
          <p className="about-lead">{translate(locale, 'aboutLicenseBody')}</p>
        </Card>
      </div>
    </div>
  );
}
