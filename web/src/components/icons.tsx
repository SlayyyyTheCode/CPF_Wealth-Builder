/* Animated flat SVG icons — on-brand pastel, lightweight, motion via CSS.
   Wrapper sets color via currentColor; accent shapes use chart vars.
   Motion respects prefers-reduced-motion (see globals.css). */
import type { ReactNode } from "react";

type IconProps = { className?: string };

/* Overview — dashboard with growing bars */
export function OverviewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <rect x="6" y="8" width="36" height="28" rx="4" fill="currentColor" opacity="0.12" />
      <g>
        <rect className="anim-bar" x="13" y="20" width="5" height="12" rx="1.5" fill="var(--chart-1)" />
        <rect className="anim-bar" x="22" y="15" width="5" height="17" rx="1.5" fill="var(--chart-2)" />
        <rect className="anim-bar" x="31" y="23" width="5" height="9" rx="1.5" fill="var(--chart-4)" />
      </g>
      <rect x="14" y="39" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

/* Milestones — target with arrow */
export function MilestonesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="22" cy="26" r="15" fill="currentColor" opacity="0.12" />
      <circle cx="22" cy="26" r="9" fill="none" stroke="var(--chart-2)" strokeWidth="2.5" />
      <circle className="anim-pulse-soft" cx="22" cy="26" r="3.5" fill="var(--chart-3)" style={{ transformOrigin: "22px 26px" }} />
      <path d="M22 26 L40 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M33 8 H40 V15" stroke="var(--chart-4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Medisave — health shield with cross */
export function MedisaveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <path d="M24 6 L39 12 V24 C39 33 32 39 24 42 C16 39 9 33 9 24 V12 Z" fill="currentColor" opacity="0.12" />
      <path d="M24 6 L39 12 V24 C39 33 32 39 24 42 C16 39 9 33 9 24 V12 Z" fill="none" stroke="var(--chart-2)" strokeWidth="2.5" strokeLinejoin="round" />
      <g className="anim-pulse-soft" style={{ transformOrigin: "24px 24px" }}>
        <rect x="21" y="15" width="6" height="18" rx="2" fill="var(--chart-3)" />
        <rect x="15" y="21" width="18" height="6" rx="2" fill="var(--chart-3)" />
      </g>
    </svg>
  );
}

/* Special Account — coins stack */
export function SavingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <ellipse cx="24" cy="38" rx="14" ry="4" fill="currentColor" opacity="0.12" />
      <g className="anim-float">
        <ellipse cx="24" cy="14" rx="11" ry="4.5" fill="var(--chart-4)" />
        <path d="M13 14 V21 C13 23.5 18 25.5 24 25.5 C30 25.5 35 23.5 35 21 V14" fill="var(--chart-4)" opacity="0.85" />
        <path d="M13 21 V28 C13 30.5 18 32.5 24 32.5 C30 32.5 35 30.5 35 28 V21" fill="var(--chart-1)" opacity="0.85" />
        <text x="24" y="31" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">$</text>
      </g>
    </svg>
  );
}

/* Ordinary Account — wallet with house roof (OA funds housing) */
export function OrdinaryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <rect x="7" y="16" width="34" height="24" rx="4" fill="currentColor" opacity="0.12" />
      <rect x="7" y="16" width="34" height="24" rx="4" fill="none" stroke="var(--chart-1)" strokeWidth="2.5" />
      <path d="M24 6 L40 17 H8 Z" fill="var(--chart-4)" opacity="0.85" />
      <g className="anim-float" style={{ transformOrigin: "33px 28px" }}>
        <circle cx="33" cy="28" r="4.5" fill="var(--chart-2)" />
        <text x="33" y="31" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">$</text>
      </g>
    </svg>
  );
}

/* Optimisation — glowing lightbulb */
export function OptimiseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle className="anim-pulse-soft" cx="24" cy="20" r="14" fill="var(--chart-4)" opacity="0.18" style={{ transformOrigin: "24px 20px" }} />
      <path d="M24 8 C17 8 13 13 13 19 C13 23 15 25 17 28 C18 29.5 18 31 18 32 H30 C30 31 30 29.5 31 28 C33 25 35 23 35 19 C35 13 31 8 24 8 Z" fill="var(--chart-4)" />
      <rect x="19" y="34" width="10" height="3" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="20.5" y="38" width="7" height="3" rx="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/* Housing — house */
export function HousingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <path d="M24 8 L40 22 H8 Z" fill="var(--chart-3)" />
      <rect x="12" y="22" width="24" height="18" rx="2" fill="currentColor" opacity="0.12" />
      <rect x="12" y="22" width="24" height="18" rx="2" fill="none" stroke="var(--chart-1)" strokeWidth="2.5" />
      <rect className="anim-pulse-soft" x="20" y="28" width="8" height="12" rx="1.5" fill="var(--chart-4)" style={{ transformOrigin: "24px 34px" }} />
    </svg>
  );
}

/* Admin — shield with check */
export function ShieldCheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <path d="M24 6 L39 12 V24 C39 33 32 39 24 42 C16 39 9 33 9 24 V12 Z" fill="var(--chart-2)" opacity="0.18" />
      <path d="M24 6 L39 12 V24 C39 33 32 39 24 42 C16 39 9 33 9 24 V12 Z" fill="none" stroke="var(--chart-2)" strokeWidth="2.5" strokeLinejoin="round" />
      <path className="anim-pulse-soft" d="M17 24 L22 29 L31 18" stroke="var(--chart-3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transformOrigin: "24px 24px" }} />
    </svg>
  );
}

/* Rocket — growth / get started */
export function RocketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <g className="anim-float">
        <path d="M24 6 C31 11 33 19 33 26 H15 C15 19 17 11 24 6 Z" fill="var(--chart-1)" />
        <circle cx="24" cy="18" r="3.5" fill="var(--color-surface)" />
        <path d="M15 26 L10 31 L16 30 Z" fill="var(--chart-3)" />
        <path d="M33 26 L38 31 L32 30 Z" fill="var(--chart-3)" />
      </g>
      <path className="anim-pulse-soft" d="M24 30 L24 40" stroke="var(--chart-4)" strokeWidth="3" strokeLinecap="round" style={{ transformOrigin: "24px 35px" }} />
    </svg>
  );
}

/* Settings — gear */
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="16" fill="currentColor" opacity="0.10" />
      <g className="anim-spin-slow" style={{ transformOrigin: "24px 24px" }}>
        <path d="M24 12 L26 12 L26.8 16 C28 16.4 29.1 17 30 17.8 L33.8 16.3 L35.7 19.7 L32.7 22.3 C32.9 23.5 32.9 24.5 32.7 25.7 L35.7 28.3 L33.8 31.7 L30 30.2 C29.1 31 28 31.6 26.8 32 L26 36 L22 36 L21.2 32 C20 31.6 18.9 31 18 30.2 L14.2 31.7 L12.3 28.3 L15.3 25.7 C15.1 24.5 15.1 23.5 15.3 22.3 L12.3 19.7 L14.2 16.3 L18 17.8 C18.9 17 20 16.4 21.2 16 L22 12 Z" fill="var(--chart-1)" />
        <circle cx="24" cy="24" r="5" fill="var(--color-surface)" />
      </g>
    </svg>
  );
}

/* Clients — people */
export function ClientsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="18" fill="currentColor" opacity="0.10" />
      <g className="anim-float">
        <circle cx="19" cy="19" r="5" fill="var(--chart-1)" />
        <path d="M9 36 C9 29 14 26 19 26 C24 26 29 29 29 36 Z" fill="var(--chart-1)" opacity="0.85" />
        <circle cx="31" cy="21" r="4.5" fill="var(--chart-2)" />
        <path d="M24 36 C24 30 28 27.5 31 27.5 C36 27.5 39 31 39 36 Z" fill="var(--chart-2)" opacity="0.85" />
      </g>
    </svg>
  );
}

/* Reusable page heading with an animated icon. */
export function PageHeading({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="anim-float grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-surface-raised)] text-[var(--color-primary)] shadow-[var(--shadow-card)]">
        {icon}
      </span>
      <div>
        <h1 className="text-2xl font-bold leading-tight text-[var(--color-fg)]">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-muted)]">{subtitle}</p>}
      </div>
    </div>
  );
}
