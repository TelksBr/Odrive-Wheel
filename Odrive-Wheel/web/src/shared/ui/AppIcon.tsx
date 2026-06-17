const spriteUrl = `${import.meta.env.BASE_URL}icons.svg`;

export type AppIconId =
  | 'tab-dashboard'
  | 'tab-setup'
  | 'tab-motor'
  | 'tab-tune'
  | 'tab-ffb-test'
  | 'tab-perf-test'
  | 'tab-inputs'
  | 'tab-observe'
  | 'tab-maintain'
  | 'tab-commands'
  | 'tab-console'
  | 'tab-about'
  | 'icon-search'
  | 'icon-connect'
  | 'icon-save'
  | 'icon-install'
  | 'icon-refresh'
  | 'github-icon'
  | 'documentation-icon'
  | 'social-icon';

interface AppIconProps {
  id: AppIconId | string;
  size?: number;
  className?: string;
  title?: string;
}

export function AppIcon({ id, size = 18, className, title }: AppIconProps) {
  return (
    <svg
      className={className ? `app-icon ${className}` : 'app-icon'}
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <use href={`${spriteUrl}#${id}`} />
    </svg>
  );
}

export function AppLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `app-logo ${className}` : 'app-logo'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <path
        fill="currentColor"
        d="M17 3.34a10 10 0 1 1 -15 8.66l.005 -.324a10 10 0 0 1 14.995 -8.336m-13 8.66a8 8 0 0 0 7 7.937v-5.107a3 3 0 0 1 -1.898 -2.05l-5.07 -1.504q -.031 .36 -.032 .725m15.967 -.725l-5.069 1.503a3 3 0 0 1 -1.897 2.051v5.108a8 8 0 0 0 6.985 -8.422zm-11.967 -6.204a8 8 0 0 0 -3.536 4.244l4.812 1.426a3 3 0 0 1 5.448 0l4.812 -1.426a8 8 0 0 0 -11.536 -4.244"
      />
    </svg>
  );
}
