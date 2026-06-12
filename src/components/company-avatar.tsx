import { Building2 } from "lucide-react";

/**
 * Company identity badge: the uploaded company photo when present, otherwise a
 * neat accent tile with the Building2 mark. Server-renderable (no hooks) so it
 * can drop into any company surface — list, page header, drawer, brief.
 */
export function CompanyAvatar({
  name,
  accent,
  logoUrl,
  size = 44,
  rounded = "rounded-2xl",
  iconSize = 19,
  className = "",
}: {
  name: string;
  accent?: string | null;
  logoUrl?: string | null;
  size?: number;
  rounded?: string;
  iconSize?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        style={dim}
        className={`${rounded} object-cover shadow-sm shrink-0 ring-1 ring-border/60 bg-bg-elev ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...dim, backgroundColor: accent || "hsl(var(--accent))" }}
      className={`${rounded} inline-flex items-center justify-center text-white shadow-sm shrink-0 ${className}`}
    >
      <Building2 size={iconSize} />
    </span>
  );
}
