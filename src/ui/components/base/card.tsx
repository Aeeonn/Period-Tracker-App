import type { ArticleHTMLAttributes, ComponentChildren } from 'preact';

export interface CardProps extends ArticleHTMLAttributes<HTMLElement> {
  heading?: string;
  children?: ComponentChildren;
}

export function Card({ class: className, heading, children, ...props }: CardProps) {
  const classes = ['ui-card', className].filter(Boolean).join(' ');

  return (
    <article {...props} class={classes}>
      {heading ? <h2 class="ui-card__heading">{heading}</h2> : null}
      {children}
    </article>
  );
}
