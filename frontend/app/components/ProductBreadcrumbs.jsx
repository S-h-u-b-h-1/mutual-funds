import Link from "next/link";

export default function ProductBreadcrumbs({ items = [], className = "" }) {
  const normalized = [["Home", "/"], ...items].filter(Boolean);
  if (normalized.length <= 1) return null;

  return (
    <nav className={`mb-5 flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap text-[11px] font-semibold text-ink-faint ${className}`} aria-label="Breadcrumb">
      {normalized.map(([label, href], index) => {
        const isLast = index === normalized.length - 1;
        return (
          <span key={`${href || label}-${index}`} className="flex min-w-0 items-center gap-2">
            {index > 0 && <span aria-hidden="true" className="text-line-strong">/</span>}
            {isLast || !href ? (
              <span aria-current="page" className="truncate text-ink-muted">{label}</span>
            ) : (
              <Link href={href} className="truncate rounded-full px-1 py-0.5 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/50">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
