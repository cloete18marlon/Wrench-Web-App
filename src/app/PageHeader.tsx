import { BackButton } from "./NavHistory";

/** Standard top of a page: back button, title, optional action on the right. */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <BackButton fallback={back} />
      <div className="page-head-text">
        <h1>{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {action && <div className="page-head-action">{action}</div>}
    </header>
  );
}
