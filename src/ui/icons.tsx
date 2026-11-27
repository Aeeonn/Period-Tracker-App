import type { ComponentChildren } from 'preact';

/** Small line icons drawn for Flo. Always decorative: names come from visible text. */
function Svg(props: { children: ComponentChildren; class?: string | undefined }) {
  return (
    <svg
      class={['icon', props.class].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

type IconProps = { class?: string };

export const CycleIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 3.5a8.5 8.5 0 1 1-7.36 4.25" />
    <circle cx="6.9" cy="5.6" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" stroke-width="2.4" />
  </Svg>
);

export const PatternsIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M5.5 20v-6M12 20V5M18.5 20v-9.5" stroke-width="3" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.3a4.1 4.1 0 0 1 7.5 2.3C19.5 15.4 12 20 12 20z" />
  </Svg>
);

export const SlidersIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
    <circle cx="15" cy="7" r="2.5" />
    <circle cx="9" cy="17" r="2.5" />
  </Svg>
);

export const BellIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 21a2.2 2.2 0 0 0 4 0" />
  </Svg>
);

export const DropIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 3.5c3.2 3.8 6 7.2 6 10.4a6 6 0 0 1-12 0c0-3.2 2.8-6.6 6-10.4z" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 3.5c.7 4.3 2.6 6.4 6.8 7.1-4.2.7-6.1 2.8-6.8 7.1-.7-4.3-2.6-6.4-6.8-7.1 4.2-.7 6.1-2.8 6.8-7.1z" />
    <path d="M19 3v3M17.5 4.5h3" stroke-width="1.6" />
  </Svg>
);

export const StarIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
  </Svg>
);

export const FlameIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 21a6.5 6.5 0 0 1-6.5-6.5c0-2.6 1.4-4.4 2.9-6 .2 1.6.9 2.7 2.1 3.3-.2-3 1.1-6 3.5-8.8.5 2.8 2 4.6 3.4 6.4 1.3 1.6 2.1 3.2 2.1 5.1A6.5 6.5 0 0 1 12 21z" />
    <path d="M12 21a2.7 2.7 0 0 1-2.7-2.7c0-1.4 1-2.4 2.1-3.4.2 1 .8 1.6 1.6 1.9.5-.5.8-1.2.9-2 .7.9 1 1.9 1 2.9A2.9 2.9 0 0 1 12 21z" />
  </Svg>
);

export const PulseIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M3 12.5h3.5l2.2-5 4.3 10 2.3-5H21" />
  </Svg>
);

export const SmileIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.6 14.2a4.2 4.2 0 0 0 6.8 0" />
    <path d="M9.2 9.8h.01M14.8 9.8h.01" stroke-width="2.6" />
  </Svg>
);

export const LeafIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M5 19c0-8.2 5.2-13.3 14.5-14-.6 9.4-5.8 14-14.5 14z" />
    <path d="M5 19l7.5-7.5" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14.5 3.5V8H19M9 12.5h6M9 16h4" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.8" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M9 6.5v11M15 6.5v11" stroke-width="2.6" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M5.5 12h13" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z" />
    <path d="M13.5 7.3l3.2 3.2" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4v4h-4" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 4v10.5M7.5 10L12 14.5 16.5 10M5 19.5h14" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M12 14.5V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </Svg>
);

export const ShareIosIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M8.5 9.5H6.5v11h11v-11h-2M12 3.5v11M8.7 6.8L12 3.5l3.3 3.3" />
  </Svg>
);

export const AddSquareIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8h.01" stroke-width="2.4" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M10.3 4.5a2 2 0 0 1 3.4 0l7 12.2a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z" />
    <path d="M12 9.5v4M12 16.8h.01" stroke-width="2.4" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
    <path d="M10.5 18h3" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.8" />
    <path d="M15.5 8.5V6.3A2.3 2.3 0 0 0 13.2 4H6.3A2.3 2.3 0 0 0 4 6.3v6.9a2.3 2.3 0 0 0 2.3 2.3h2.2" />
  </Svg>
);

export const HourglassIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M7 3.5h10M7 20.5h10" />
    <path d="M8 3.5c0 4.2 4 5.2 4 8.5s-4 4.3-4 8.5M16 3.5c0 4.2-4 5.2-4 8.5s4 4.3 4 8.5" />
  </Svg>
);

export const UnlinkIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <path d="M9.5 14.5l-2.3 2.3a3.2 3.2 0 0 1-4.5-4.5L5 10M14.5 9.5l2.3-2.3a3.2 3.2 0 0 1 4.5 4.5L19 14M4 4l16 16" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg class={p.class}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.6-3.3 2.8-5.2 5.5-5.2s4.9 1.9 5.5 5.2" />
    <circle cx="16.5" cy="9.5" r="2.6" />
    <path d="M16.2 14.4c2.3 0 3.9 1.6 4.3 4.6" />
  </Svg>
);

/** The Flo mark: a soft drop with a heart-shaped highlight. Decorative. */
export function Logo(props: { class?: string; id: string }) {
  const gradient = `${props.id}-g`;
  const shine = `${props.id}-s`;
  return (
    <svg
      class={['logo', props.class].filter(Boolean).join(' ')}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" class="logo__stop-a" />
          <stop offset="0.55" class="logo__stop-b" />
          <stop offset="1" class="logo__stop-c" />
        </linearGradient>
        <radialGradient id={shine} cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M48 8c13 15.5 30 31 30 50a30 30 0 0 1-60 0C18 39 35 23.5 48 8z"
        fill={`url(#${gradient})`}
      />
      <path
        d="M48 8c13 15.5 30 31 30 50a30 30 0 0 1-60 0C18 39 35 23.5 48 8z"
        fill={`url(#${shine})`}
      />
      <path
        d="M48 70s-12-7.2-12-15.6a6.4 6.4 0 0 1 12-3.2 6.4 6.4 0 0 1 12 3.2C60 62.8 48 70 48 70z"
        fill="#fff"
        opacity="0.92"
      />
    </svg>
  );
}
