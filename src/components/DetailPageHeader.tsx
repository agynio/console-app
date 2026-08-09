import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

type DetailPageHeaderProps = {
  /** Where this entity is listed, as a breadcrumb rather than a back button. */
  parentLabel: string;
  parentHref: string;
  title: string;
  /** One line of the facts that identify it: runner, flavor, image. */
  meta?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  testId?: string;
};

/**
 * The entity is the subject of its own page, so it is named here and nowhere
 * else. Tabs below carry the sections, and a tab does not repeat its own label
 * as a heading — the strip already said it.
 *
 * The breadcrumb replaces a lone back button: it navigates the same way and
 * states where you are, which the button could not.
 */
export function DetailPageHeader({
  parentLabel,
  parentHref,
  title,
  meta,
  badge,
  actions,
  testId,
}: DetailPageHeaderProps) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <NavLink to={parentHref} className="text-primary hover:underline" data-testid={`${testId}-parent`}>
          {parentLabel}
        </NavLink>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{title}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground" data-testid={`${testId}-title`}>
            {title}
          </h1>
          {badge}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-meta`}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}
