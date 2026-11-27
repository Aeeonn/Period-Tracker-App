import type { ComponentChildren } from 'preact';

/** Small decorative illustrations. They are always hidden from assistive technology. */

const HEART = 'M0 8.5S-9.5 3-9.5-2.8A5 5 0 0 1 0-5.6a5 5 0 0 1 9.5 2.8C9.5 3 0 8.5 0 8.5z';
const SPARKLE = 'M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z';

function Art(props: { class?: string | undefined; children: ComponentChildren }) {
  return (
    <svg
      class={props.class ?? 'empty__art'}
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

/** Positioned with an SVG attribute on a group so CSS animations on the shape stay relative. */
function Shape(props: { d: string; x: number; y: number; scale?: number; class: string }) {
  return (
    <g transform={`translate(${props.x} ${props.y}) scale(${props.scale ?? 1})`}>
      <path class={props.class} d={props.d} />
    </g>
  );
}

/** Her phone sends a locked copy to his phone. */
export function ShareArt(props: { class?: string }) {
  return (
    <Art class={props.class}>
      <circle class="art-fill-a" cx="80" cy="60" r="56" />
      <rect class="art-phone" x="16" y="24" width="42" height="72" rx="11" />
      <rect class="art-phone" x="102" y="24" width="42" height="72" rx="11" />
      <Shape d={HEART} x={37} y={60} scale={1.2} class="art-dot-period art-beat" />
      <Shape d={HEART} x={123} y={60} scale={1.2} class="art-heart-line" />
      <path class="art-dash" d="M63 60h34" />
      <g transform="translate(80 60)">
        <path class="art-lock" d="M-4.5-3v-3.5a4.5 4.5 0 0 1 9 0V-3" />
        <rect class="art-dot-accent" x="-8.5" y="-3.5" width="17" height="13" rx="3.5" />
      </g>
      <Shape d={SPARKLE} x={136} y={14} scale={0.7} class="art-dot-sun art-twinkle" />
      <Shape d={SPARKLE} x={22} y={104} scale={0.5} class="art-dot-fertile art-twinkle--late" />
    </Art>
  );
}

/** His phone, waiting for something to arrive. */
export function WaitingArt(props: { class?: string }) {
  return (
    <Art class={props.class}>
      <circle class="art-fill-a" cx="80" cy="60" r="54" />
      <rect class="art-phone" x="56" y="18" width="48" height="84" rx="12" />
      <circle class="art-dot-accent art-wait" cx="68" cy="60" r="4.5" />
      <circle class="art-dot-accent art-wait art-wait--2" cx="80" cy="60" r="4.5" />
      <circle class="art-dot-accent art-wait art-wait--3" cx="92" cy="60" r="4.5" />
      <Shape d={HEART} x={126} y={34} scale={1.1} class="art-dot-period art-float" />
      <Shape d={SPARKLE} x={32} y={88} scale={0.7} class="art-dot-sun art-twinkle" />
    </Art>
  );
}

/** A soft pause. */
export function PausedArt(props: { class?: string }) {
  return (
    <Art class={props.class}>
      <circle class="art-fill-a" cx="80" cy="60" r="54" />
      <circle class="art-surface art-breathe" cx="80" cy="60" r="32" />
      <rect class="art-dot-accent" x="68" y="46" width="9" height="28" rx="4.5" />
      <rect class="art-dot-accent" x="83" y="46" width="9" height="28" rx="4.5" />
      <circle class="art-dot-period art-float" cx="128" cy="28" r="5" />
      <circle class="art-dot-mint art-float art-float--slow" cx="34" cy="94" r="4" />
    </Art>
  );
}

/** A heart outline: sharing has ended, kindly. */
export function EndedArt(props: { class?: string }) {
  return (
    <Art class={props.class}>
      <circle class="art-fill-b" cx="80" cy="60" r="54" />
      <Shape d={HEART} x={80} y={64} scale={3.4} class="art-heart-dashed" />
      <Shape d={SPARKLE} x={124} y={26} scale={0.6} class="art-dot-accent art-twinkle" />
      <circle class="art-dot-mint art-float art-float--slow" cx="34" cy="90" r="4" />
    </Art>
  );
}

/** Bars growing: patterns appear as she logs. */
export function ChartArt(props: { class?: string }) {
  return (
    <Art class={props.class}>
      <circle class="art-fill-a" cx="80" cy="60" r="54" />
      <rect class="art-bar art-dot-period" x="40" y="62" width="15" height="34" rx="6" />
      <rect class="art-bar art-dot-mint" x="62" y="46" width="15" height="50" rx="6" />
      <rect class="art-bar art-dot-fertile" x="84" y="54" width="15" height="42" rx="6" />
      <rect class="art-bar art-dot-peach" x="106" y="36" width="15" height="60" rx="6" />
      <Shape d={SPARKLE} x={128} y={20} scale={0.75} class="art-dot-sun art-twinkle" />
    </Art>
  );
}

/** A worried little drop for the error screen. */
export function OopsArt(props: { class?: string }) {
  return (
    <Art class={props.class}>
      <circle class="art-fill-b" cx="80" cy="62" r="52" />
      <g class="art-float">
        <path class="art-dot-period" d="M80 16S50 52 50 75a30 30 0 0 0 60 0C110 52 80 16 80 16z" />
        <circle class="art-eye" cx="70" cy="76" r="3.6" />
        <circle class="art-eye" cx="90" cy="76" r="3.6" />
        <path class="art-mouth" d="M73 93q7-6 14 0" />
      </g>
      <Shape d={SPARKLE} x={126} y={26} scale={0.6} class="art-dot-sun art-twinkle" />
    </Art>
  );
}
