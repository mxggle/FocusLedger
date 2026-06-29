import { cn } from "../../lib/cn";

/**
 * The Yolo mark: a "Y"-as-person (raised arms + cyan head) on a blue
 * rounded square with a faint clock motif. Recreated as inline SVG.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="yolo-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="26" fill="url(#yolo-bg)" />
      {/* faint clock ring + ticks */}
      <circle cx="50" cy="50" r="34" stroke="white" strokeOpacity="0.18" strokeWidth="2" />
      <g stroke="white" strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round">
        <line x1="50" y1="13" x2="50" y2="19" />
        <line x1="50" y1="81" x2="50" y2="87" />
        <line x1="13" y1="50" x2="19" y2="50" />
        <line x1="81" y1="50" x2="87" y2="50" />
      </g>
      {/* Y-as-person */}
      <g stroke="white" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M30 34 L51 57" />
        <path d="M73 30 L51 57" />
        <path d="M51 57 L51 80" />
      </g>
      <circle cx="51" cy="31" r="8" fill="#22D3EE" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <a href="#top" className={cn("group inline-flex items-center gap-2.5", className)}>
      <LogoMark size={30} className="transition-transform duration-200 group-hover:scale-105" />
      <span className="text-[17px] font-bold tracking-tight text-foreground">Yolo</span>
    </a>
  );
}
