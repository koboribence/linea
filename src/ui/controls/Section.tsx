import type { ReactNode } from 'react';

/** A titled group of controls in the editor panel. */
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <header className="section__header">
        <h2 className="section__title">{title}</h2>
        {hint && <p className="section__hint">{hint}</p>}
      </header>
      <div className="section__body">{children}</div>
    </section>
  );
}
