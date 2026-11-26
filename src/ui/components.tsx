import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import type { InfoCard } from './content.ts';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
};

export function Button({
  variant = 'primary',
  type = 'button',
  class: extra,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      class={['ui-button', `ui-button--${variant}`, extra].filter(Boolean).join(' ')}
    />
  );
}

export function Card(props: { heading?: string; class?: string; children?: ComponentChildren }) {
  return (
    <section class={['ui-card', props.class].filter(Boolean).join(' ')}>
      {props.heading ? <h2 class="ui-card__heading">{props.heading}</h2> : null}
      {props.children}
    </section>
  );
}

/** Single choice from a list; pressing the selected chip again clears it. */
export function Choice<T extends string>(props: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | undefined;
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
              {props.labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Whole-number stepper; empty means "not logged". */
export function Stepper(props: {
  label: string;
  unit: string;
  value: number | undefined;
  step?: number;
  max: number;
  onChange: (value: number | undefined) => void;
}) {
  const step = props.step ?? 1;
  const value = props.value;
  return (
    <div class="field stepper" role="group" aria-label={props.label}>
      <span class="stepper__label">{props.label}</span>
      <div class="stepper__controls">
        <button
          type="button"
          class="ui-chip"
          aria-label={`Less ${props.label.toLowerCase()}`}
          disabled={value === undefined}
          onClick={() =>
            props.onChange(value === undefined || value - step < 0 ? undefined : value - step)
          }
        >
          −
        </button>
        <output class="stepper__value" aria-live="polite">
          {value === undefined ? '—' : `${value} ${props.unit}`}
        </output>
        <button
          type="button"
          class="ui-chip"
          aria-label={`More ${props.label.toLowerCase()}`}
          disabled={value !== undefined && value + step > props.max}
          onClick={() =>
            props.onChange(value === undefined ? step : Math.min(props.max, value + step))
          }
        >
          +
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
  onChange: (checked: boolean) => void;
}) {
  const detailId = useId();
  return (
    <label class="toggle">
      <span>
        <span class="toggle__label">{props.label}</span>
        {props.detail ? (
          <span id={detailId} class="muted toggle__detail">
            {props.detail}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={props.label}
        aria-describedby={props.detail ? detailId : undefined}
        checked={props.checked}
        disabled={props.disabled ?? false}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

export function Info({ card, tone }: { card: InfoCard; tone?: 'urgent' }) {
  return (
    <Card heading={card.title} class={tone === 'urgent' ? 'card--urgent' : 'card--info'}>
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
    </Card>
  );
}
