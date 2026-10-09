import type { ComponentType } from "react";

// Phosphor "duotone" glyphs — a bold outer outline plus a soft tinted fill, instead of Lucide's
// plain 2px-stroke outline the rest of the app uses. Paths are Phosphor's own duotone SVG data
// (phosphor-icons/core, MIT) inlined directly — no new runtime dependency.
//
// Originally built for the mobile bottom tab bar (House/ClipboardText/SquaresFour/UsersThree/
// Receipt/ChartBar/Plus); extended to cover the app's most-reused "identity icon" surfaces —
// StatCard, EmptyState, and the sidebar/drawer nav — specifically the handful of icons that are
// each reused 10+ times (per an actual grep count, not a guess): Wallet, Receipt, Users,
// AlertTriangle→Warning, TrendingUp, ShoppingBag, FileText, Clock. The long tail of icons used
// only once or twice (Banknote, MapPin, ShieldCheck, …) stays plain Lucide — not worth hand-
// drawing a duotone version for a single call site. Action/button icons (Trash2, Pencil, Save,
// Plus-inside-a-button, …) also stay Lucide on purpose: an illustrative duotone icon on a button
// reads as decoration, not affordance — every mature app (Linear, Gmail, Notion) keeps button
// icons thin even where nav/identity icons are bolder.
//
// Fill is color-coded from the FashionFlow logo's own six letter colors, one per concept, always
// on — not just on hover/active — per the "always colorful" direction the user picked. The bold
// outline path stays `currentColor`, inheriting whatever neutral ink the surrounding context
// already sets (sidebar's muted/active text color, a StatCard tone's icon color, etc.) — same as
// before. Only the soft background path switches from a currentColor tint to one of these fixed
// brand hues, so each icon reads as its own color everywhere it appears, in any theme or state,
// without needing every call site (StatCard, EmptyState, nav-config) to pass a color prop.
const LOGO_RED = "#e8392b";
const LOGO_GREEN = "#1ea54c";
const LOGO_BLUE = "#2f5fe0";
const LOGO_AMBER = "#f2a900";
const LOGO_PURPLE = "#6f2bbf";
const LOGO_SKY = "#29b6e8";

interface DuotoneIconProps {
  className?: string;
  fill?: string;
  fillOpacity?: number;
}

/** Shared icon-prop type for anywhere a Lucide icon component or one of these hand-rolled
 *  duotone ones needs to be accepted interchangeably (StatCard, EmptyState, nav config, …) — a
 *  LucideIcon value is already assignable to this, so widening a field from the exact LucideIcon
 *  type to this is purely additive and never breaks an existing caller. */
export type IconComponent = ComponentType<DuotoneIconProps>;

export function HouseDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path
        fill={LOGO_RED}
        d="M216,120v96H152V152H104v64H40V120a8,8,0,0,1,2.34-5.66l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,216,120Z"
        opacity="0.32"
      />
      <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
    </svg>
  );
}

export function ClipboardTextDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path
        fill={LOGO_GREEN}
        d="M208,48V216a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8H96a39.83,39.83,0,0,0-8,24v8h80V64a39.83,39.83,0,0,0-8-24h40A8,8,0,0,1,208,48Z"
        opacity="0.32"
      />
      <path d="M168,152a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,152Zm-8-40H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm56-64V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V48A16,16,0,0,1,56,32H92.26a47.92,47.92,0,0,1,71.48,0H200A16,16,0,0,1,216,48ZM96,64h64a32,32,0,0,0-64,0ZM200,48H173.25A47.93,47.93,0,0,1,176,64v8a8,8,0,0,1-8,8H88a8,8,0,0,1-8-8V64a47.93,47.93,0,0,1,2.75-16H56V216H200Z" />
    </svg>
  );
}

export function SquaresFourDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path
        fill={LOGO_GREEN}
        d="M112,56v48a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8h48A8,8,0,0,1,112,56Zm88-8H152a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V56A8,8,0,0,0,200,48Zm-96,96H56a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V152A8,8,0,0,0,104,144Zm96,0H152a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V152A8,8,0,0,0,200,144Z"
        opacity="0.32"
      />
      <path d="M200,136H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48ZM104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Z" />
    </svg>
  );
}

export function UsersThreeDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path
        fill={LOGO_BLUE}
        d="M168,144a40,40,0,1,1-40-40A40,40,0,0,1,168,144ZM64,56A32,32,0,1,0,96,88,32,32,0,0,0,64,56Zm128,0a32,32,0,1,0,32,32A32,32,0,0,0,192,56Z"
        opacity="0.32"
      />
      <path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1,0-16,24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.85,8,57,57,0,0,0-98.15,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z" />
    </svg>
  );
}

export function ReceiptDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path
        fill={LOGO_AMBER}
        d="M224,56V208l-32-16-32,16-32-16L96,208,64,192,32,208V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z"
        opacity="0.32"
      />
      <path d="M72,104a8,8,0,0,1,8-8h96a8,8,0,0,1,0,16H80A8,8,0,0,1,72,104Zm8,40h96a8,8,0,0,0,0-16H80a8,8,0,0,0,0,16ZM232,56V208a8,8,0,0,1-11.58,7.15L192,200.94l-28.42,14.21a8,8,0,0,1-7.16,0L128,200.94,99.58,215.15a8,8,0,0,1-7.16,0L64,200.94,35.58,215.15A8,8,0,0,1,24,208V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56Zm-16,0H40V195.06l20.42-10.22a8,8,0,0,1,7.16,0L96,199.06l28.42-14.22a8,8,0,0,1,7.16,0L160,199.06l28.42-14.22a8,8,0,0,1,7.16,0L216,195.06Z" />
    </svg>
  );
}

export function ChartBarDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_PURPLE} d="M208,40V208H152V40Z" opacity="0.32" />
      <path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z" />
    </svg>
  );
}

// ── StatCard / EmptyState / sidebar — icons reused 10+ times app-wide ─────────────────────────

export function WalletDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_SKY} d="M224,80V192a8,8,0,0,1-8,8H56a16,16,0,0,1-16-16V56A16,16,0,0,0,56,72H216A8,8,0,0,1,224,80Z" opacity="0.32" />
      <path d="M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-48-60a12,12,0,1,1,12,12A12,12,0,0,1,168,132Z" />
    </svg>
  );
}

/** Two-person "Users" (distinct from UsersThreeDuotoneIcon above, which is the bolder 3-person
 *  mark used on the tab bar) — matches Lucide's `Users`, the one actually used across
 *  StatCard/EmptyState call sites. */
export function UsersDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_BLUE} d="M136,108A52,52,0,1,1,84,56,52,52,0,0,1,136,108Z" opacity="0.32" />
      <path d="M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z" />
    </svg>
  );
}

/** Phosphor's "Warning" triangle — the duotone match for Lucide's `AlertTriangle`. */
export function WarningDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_RED} d="M215.46,216H40.54C27.92,216,20,202.79,26.13,192.09L113.59,40.22c6.3-11,22.52-11,28.82,0l87.46,151.87C236,202.79,228.08,216,215.46,216Z" opacity="0.32" />
      <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z" />
    </svg>
  );
}

export function TrendUpDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_GREEN} d="M232,56v64L168,56Z" opacity="0.32" />
      <path d="M232,48H168a8,8,0,0,0-5.66,13.66L188.69,88,136,140.69l-34.34-34.35a8,8,0,0,0-11.32,0l-72,72a8,8,0,0,0,11.32,11.32L96,123.31l34.34,34.35a8,8,0,0,0,11.32,0L200,99.31l26.34,26.35A8,8,0,0,0,240,120V56A8,8,0,0,0,232,48Zm-8,52.69L187.31,64H224Z" />
    </svg>
  );
}

export function ShoppingBagDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_PURPLE} d="M224,56V200a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z" opacity="0.32" />
      <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a48,48,0,0,1-96,0,8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0Z" />
    </svg>
  );
}

/** Phosphor's plain "File Text" (a dog-eared page) — distinct from ClipboardTextDuotoneIcon
 *  above (a clipboard holding a page), matching Lucide's `FileText` specifically. */
export function FileTextDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_AMBER} d="M208,88H152V32Z" opacity="0.32" />
      <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z" />
    </svg>
  );
}

export function ClockDuotoneIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path fill={LOGO_SKY} d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.32" />
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
    </svg>
  );
}

/** Solid plus glyph (Phosphor's regular, not duotone — a single-tone cross has nothing for a
 *  second tone to add) for the centre FAB, replacing Lucide's thin two-line plus to match the
 *  bolder duotone weight of the tabs around it. */
export function PlusGlyphIcon({ className }: DuotoneIconProps) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className={className}>
      <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
    </svg>
  );
}
