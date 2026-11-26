import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import type { InfoCard } from './content.ts';
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  DropIcon,
  HeartIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  PulseIcon,
} from './icons.tsx';

export type Tone = 'accent' | 'period' | 'fertile' | 'mint' | 'peach' | 'sky' | 'sun';

/** Joins class names, skipping empty parts. */
export function cx(...parts: unknown[]): string {
  return parts.filter((part) => typeof part === 'string' && part !== '').join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  block?: boolean;
};

export function Button({
  variant = 'primary',
  type = 'button',
  block = false,
  class: extra,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      class={cx('ui-button', `ui-button--${variant}`, block && 'ui-button--block', extra)}
    />
  );
}

/** A small rounded icon tile. Decorative: the text next to it carries the meaning. */
export function Badge(props: {
  tone?: Tone | undefined;
  small?: boolean;
  children: ComponentChildren;
}) {
  return (
    <span
      class={cx(
        'badge',
        props.small && 'badge--sm',
        props.tone && props.tone !== 'accent' && `badge--${props.tone}`,
      )}
      aria-hidden="true"
    >
      {props.children}
    </span>
  );
}

export function Card(props: {
  heading?: string;
  icon?: ComponentChildren;
  tone?: Tone;
  class?: string;
  children?: ComponentChildren;
}) {
  const heading = props.heading ? <h2 class="ui-card__heading">{props.heading}</h2> : null;
  return (
    <section class={cx('ui-card', props.tone && `card--tone card--${props.tone}`, props.class)}>
      {heading && props.icon ? (
        <div class="ui-card__head">
          <Badge tone={props.tone}>{props.icon}</Badge>
          {heading}
        </div>
      ) : (
        heading
      )}
      {props.children}
    </section>
  );
}

export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  aside?: ComponentChildren;
  lede?: ComponentChildren;
}) {
  return (
    <header class="page-head">
      <div class="page-head__text">
        {props.eyebrow ? <p class="eyebrow">{props.eyebrow}</p> : null}
        <h1>{props.title}</h1>
      </div>
      {props.aside ? <div class="page-head__aside">{props.aside}</div> : null}
      {props.lede ? <p class="lede">{props.lede}</p> : null}
    </header>
  );
}

/** Single choice from a list; pressing the selected chip again clears it. */
export function Choice<T extends string>(props: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | undefined;
  decor?: Partial<Record<T, ComponentChildren>>;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <fieldset class="field">
      <legend>{props.label}</legend>
      <div class="chips">
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            class="ui-chip"
            aria-pressed={props.value === option}
            onClick={() => props.onChange(props.value === option ? undefined : option)}
          >
            <ChipDecor>{props.decor?.[option]}</ChipDecor>
            {props.labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Multiple choice from a list. */
export function MultiChoice<T extends string>(props: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: readonly T[] | undefined;
  decor?: Partial<Record<T, ComponentChildren>>;
  onChange: (value: T[]) => void;
}) {
  const selected = props.value ?? [];
  return (
    <fieldset class="field">
      <legend>{props.label}</legend>
      <div class="chips">
        {props.options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              class="ui-chip"
              aria-pressed={on}
              onClick={() =>
                props.onChange(
                  on
                    ? selected.filter((item) => item !== option)
                    : props.options.filter((item) => item === option || selected.includes(item)),
                )
              }
            >
              <ChipDecor>{props.decor?.[option]}</ChipDecor>
              {props.labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ChipDecor(props: { children: ComponentChildren }) {
  if (props.children === undefined || props.children === null) return null;
  return (
    <span class="ui-chip__icon" aria-hidden="true">
      {props.children}
    </span>
  );
}

/** Rising bars for low-to-high scales (1 to `of` bars lit). Decorative. */
export function LevelBars(props: { value: number; of?: number }) {
  const of = props.of ?? 3;
  const bars = Array.from({ length: of }, (_, index) => index);
  const width = of * 4 - 1;
  return (
    <svg class="level" viewBox={`0 0 ${width} 12`} width={width + 2} height="14" focusable="false">
      {bars.map((index) => {
        const height = 4 + (8 * (index + 1)) / of;
        return (
          <rect
            key={index}
            class={index < props.value ? 'on' : undefined}
            x={index * 4}
            y={12 - height}
            width="3"
            height={height}
            rx="1.5"
          />
        );
      })}
    </svg>
  );
}

/** Up to four little drops for flow amounts. Decorative. */
export function Drops(props: { count: number }) {
  if (props.count === 0) {
    return (
      <svg class="drops" viewBox="0 0 10 12" width="10" height="12" focusable="false">
        <circle cx="5" cy="7" r="1.6" />
      </svg>
    );
  }
  const width = props.count * 7 + 1;
  return (
    <svg class="drops" viewBox={`0 0 ${width} 12`} width={width} height="12" focusable="false">
      {Array.from({ length: props.count }, (_, index) => (
        <path
          key={index}
          transform={`translate(${index * 7} 0)`}
          d="M4 1c1.9 2.3 3.5 4.2 3.5 6.2a3.5 3.5 0 0 1-7 0C.5 5.2 2.1 3.3 4 1z"
        />
      ))}
    </svg>
  );
}

/** Whole-number stepper; empty means "not logged". */
export function Stepper(props: {
  label: string;
  unit: string;
  unitOne?: string;
  value: number | undefined;
  step?: number;
  max: number;
  icon?: ComponentChildren;
  tone?: Tone;
  onChange: (value: number | undefined) => void;
}) {
  const step = props.step ?? 1;
  const value = props.value;
  const name = props.label.toLowerCase();
  const unit = value === 1 && props.unitOne ? props.unitOne : props.unit;
  return (
    <div class="stepper" role="group" aria-label={props.label}>
      <div class="stepper__text">
        {props.icon ? (
          <Badge small tone={props.tone}>
            {props.icon}
          </Badge>
        ) : null}
        <div>
          <span class="stepper__label">{props.label}</span>
          <output
            class="stepper__value"
            aria-live="polite"
            data-empty={value === undefined ? 'true' : undefined}
          >
            <span class="stepper__num" key={value ?? 'none'}>
              {value === undefined ? 'Not logged' : `${value} ${unit}`}
            </span>
          </output>
        </div>
      </div>
      <div class="stepper__controls">
        <button
          type="button"
          class="ui-chip ui-chip--round"
          aria-label={`Less ${name}`}
          disabled={value === undefined}
          onClick={() =>
            props.onChange(value === undefined || value - step < 0 ? undefined : value - step)
          }
        >
          <MinusIcon />
        </button>
        <button
          type="button"
          class="ui-chip ui-chip--round"
          aria-label={`More ${name}`}
          disabled={value !== undefined && value + step > props.max}
          onClick={() =>
            props.onChange(value === undefined ? step : Math.min(props.max, value + step))
          }
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

export function Toggle(props: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  icon?: ComponentChildren;
  tone?: Tone;
  onChange: (checked: boolean) => void;
}) {
  const detailId = useId();
  return (
    <label class={cx('toggle', props.disabled && 'toggle--disabled')}>
      {props.icon ? (
        <Badge small tone={props.tone}>
          {props.icon}
        </Badge>
      ) : null}
      <span class="toggle__text">
        <span class="toggle__label">{props.label}</span>
        {props.detail ? (
          <span id={detailId} class="toggle__detail">
            {props.detail}
          </span>
        ) : null}
      </span>
      <span class="switch">
        <input
          class="switch__input"
          type="checkbox"
          role="switch"
          aria-label={props.label}
          aria-describedby={props.detail ? detailId : undefined}
          checked={props.checked}
          disabled={props.disabled ?? false}
          onChange={(event) => props.onChange(event.currentTarget.checked)}
        />
        <span class="switch__track" aria-hidden="true">
          <span class="switch__thumb" />
        </span>
      </span>
    </label>
  );
}

/** A log section that folds away; the header shows what is logged while closed. */
export function Section(props: {
  title: string;
  icon: ComponentChildren;
  tone?: Tone;
  summary?: string | undefined;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  const bodyId = useId();
  return (
    <section class="ui-card section">
      <h2 class="section__heading">
        <button
          type="button"
          class="section__toggle"
          aria-expanded={props.open}
          aria-controls={props.open ? bodyId : undefined}
          onClick={props.onToggle}
        >
          <Badge tone={props.tone}>{props.icon}</Badge>
          <span class="section__text">
            <span class="section__name">{props.title}</span>
            {!props.open && props.summary ? (
              <span class="section__summary">{props.summary}</span>
            ) : null}
          </span>
          {props.done ? (
            <span class="section__check">
              <CheckIcon />
              <span class="visually-hidden">, logged</span>
            </span>
          ) : null}
          <ChevronDownIcon class="section__chevron" />
        </button>
      </h2>
      {props.open ? (
        <div id={bodyId} class="section__body">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}

export function Segmented<T extends string>(props: {
  legend: string;
  options: readonly { value: T; label: string; icon: ComponentChildren }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset class="field">
      <legend>{props.legend}</legend>
      <div class="segmented">
        {props.options.map((option) => (
          <label key={option.value} class="segmented__option">
            <input
              class="segmented__input"
              type="radio"
              name={name}
              value={option.value}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            <span class="segmented__face">
              {option.icon}
              <span>{option.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const INFO_LOOK: Record<string, { icon: ComponentChildren; tone: Tone }> = {
  'period-pain': { icon: <PulseIcon />, tone: 'peach' },
  'heavy-bleeding': { icon: <DropIcon />, tone: 'period' },
  'not-birth-control': { icon: <InfoIcon />, tone: 'fertile' },
  desire: { icon: <HeartIcon />, tone: 'accent' },
};

export function Info({ card, tone }: { card: InfoCard; tone?: 'urgent' }) {
  const look = INFO_LOOK[card.id] ?? { icon: <InfoIcon />, tone: 'accent' };
  return (
    <section class={cx('ui-card', tone === 'urgent' ? 'card--urgent' : 'card--info')}>
      <div class="ui-card__head">
        <Badge tone={tone === 'urgent' ? 'period' : look.tone}>
          {tone === 'urgent' ? <AlertIcon /> : look.icon}
        </Badge>
        <h2 class="ui-card__heading">{card.title}</h2>
      </div>
      {card.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p class="sources">
        Sources:{' '}
        {card.sources.map((source, index) => (
          <span key={source.url}>
            {index > 0 ? '; ' : ''}
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.publisher}, {source.title}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}
