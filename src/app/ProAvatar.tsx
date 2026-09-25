/** A pro's photo, or their initials on navy when they haven't added one. */
export function ProAvatar({ url, name, initials, size = "md" }: {
  url: string | null;
  name: string;
  initials: string;
  size?: "md" | "lg";
}) {
  const cls = `avatar${size === "lg" ? " avatar-lg" : ""}`;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`Photo of ${name}`} className={cls} loading="lazy" />
  ) : (
    <span className={cls} aria-hidden="true">{initials}</span>
  );
}
