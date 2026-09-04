import type { ReactNode } from "react";

export type IconProps = { size?: number; className?: string };

const S = ({ size = 16, className, children }: IconProps & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);

export const IconMark = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l7 4v5c0 4.6-3 8.7-7 11-4-2.3-7-6.4-7-11V6l7-4zm-1 15l5.5-6.5-1.4-1.2-3.2 3.7-1.5-1.5-1.4 1.4L11 17z" />
  </svg>
);
export const IconHome = (p: IconProps) => <S {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></S>;
export const IconPlus = (p: IconProps) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconTrash = (p: IconProps) => <S {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></S>;
export const IconPlay = (p: IconProps) => <S {...p}><path d="M7 5v14l12-7z" /></S>;
export const IconStop = (p: IconProps) => <S {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></S>;
export const IconRefresh = (p: IconProps) => <S {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 3v5h-5" /></S>;
export const IconCheck = (p: IconProps) => <S {...p}><path d="M5 12.5 10 17l9-10" /></S>;
export const IconCopy = (p: IconProps) => <S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></S>;
export const IconChev = (p: IconProps) => <S {...p}><path d="M9 6l6 6-6 6" /></S>;
export const IconBook = (p: IconProps) => <S {...p}><path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 1 2-2h14" /></S>;
export const IconServer = (p: IconProps) => <S {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></S>;
export const IconLayers = (p: IconProps) => <S {...p}><path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="M2 13l10 5 10-5" /><path d="M2 18l10 5 10-5" /></S>;
export const IconSliders = (p: IconProps) => <S {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></S>;
export const IconRun = (p: IconProps) => <S {...p}><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8 8l8 8M6 9v6M18 9v6M9 6h6" /></S>;
export const IconTarget = (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></S>;
export const IconWarn = (p: IconProps) => <S {...p}><path d="M12 3 2 21h20L12 3z" /><path d="M12 9v5" /><path d="M12 17.5h.01" /></S>;
export const IconChecks = (p: IconProps) => <S {...p}><path d="M3 12l4 4L15 7" /><path d="M10 12l4 4L20 7" /></S>;
