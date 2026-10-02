// Small inline icon set (stroke icons, 24×24 grid) — no icon library needed.

type IconProps = { className?: string };

function Svg({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Brand mark: a leaf over a globe. */
export function LogoMark({ className = "h-9 w-9" }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#065f46" />
      <path d="M4 20h32M20 2c5 5 7 11 7 18s-2 13-7 18c-5-5-7-11-7-18s2-13 7-18Z" fill="none" stroke="#34d399" strokeOpacity=".45" strokeWidth="1.4" />
      <path d="M27 11c-9 0-14 5-14 12 0 2 .5 3.5 1.5 4.5C17 20 21 17 25 16c-4 2-7 5-9 12 7 1 12-5 11-17Z" fill="#d1fae5" />
    </svg>
  );
}

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);
export const TrophyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3" />
  </Svg>
);
export const GiftIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8Zm0 0s1.5-4.5 4-3.5S15 8 12 8Z" />
  </Svg>
);
export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4C10 4 5 9 5 16c0 1.5.3 2.8.9 3.9M20 4c0 9-5 15-12 15M20 4 9 15" />
  </Svg>
);
export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0 11-3v3" />
    <circle cx="16" cy="13.5" r="1.2" fill="currentColor" />
  </Svg>
);
export const MapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0" />
  </Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const SproutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-8M12 13c0-4 3-6 8-6 0 4-3 6-8 6ZM12 15c0-3-2.5-5-7-5 0 3 2.5 5 7 5Z" />
  </Svg>
);
export const CoinIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="7" rx="7" ry="3" />
    <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </Svg>
);
export const TicketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3v4Z" transform="translate(0 2)" />
    <path d="M14 6v12" strokeDasharray="2 2" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const MedalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3h8l-2 6h-4L8 3Z" />
    <circle cx="12" cy="15" r="5.5" />
    <path d="m12 12.3.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3.9-1.8Z" />
  </Svg>
);
export const TreeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-6M12 15c-4.5 0-7-2.2-7-5.2C5 6.6 8.1 3 12 3s7 3.6 7 6.8c0 3-2.5 5.2-7 5.2Z" />
    <path d="M9 21h6" />
  </Svg>
);
