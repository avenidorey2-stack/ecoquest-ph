import { amountFontSize, voucherAmount, voucherTheme } from "@/lib/voucher";
import { TicketIcon, WalletIcon } from "@/components/ui/icons";

// Ticket notches on both sides, level with the perforation.
const NOTCHES =
  "radial-gradient(circle 0.55rem at 0 70%, #0000 98%, #000) left / 51% 100% no-repeat, radial-gradient(circle 0.55rem at 100% 70%, #0000 98%, #000) right / 51% 100% no-repeat";

/**
 * A reward drawn as a gift-card style voucher in the brand's colours. Everything on it comes
 * from the reward itself, so whatever face value the team sets (₱50, ₱300, ₱100,000) is
 * exactly what's printed. Sizes are in container units, so it scales with its width.
 */
export default function VoucherArt({
  brand,
  valuePesos,
  isCash,
  className = "",
}: {
  brand: string;
  valuePesos: number;
  isCash: boolean;
  className?: string;
}) {
  const theme = voucherTheme(brand);
  const amount = voucherAmount(valuePesos);
  const label = amount ?? "₱—";
  const kind = isCash ? "E-wallet cash" : "Voucher";
  const Icon = isCash ? WalletIcon : TicketIcon;

  return (
    <div
      role="img"
      aria-label={amount ? `${amount} ${brand} ${isCash ? "cash" : "voucher"}` : `${brand} ${kind.toLowerCase()}`}
      className={`@container relative aspect-[1.9/1] w-full overflow-hidden rounded-2xl text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,.7)] ${className}`}
      style={{ background: theme.background, mask: NOTCHES, WebkitMask: NOTCHES }}
    >
      {/* Glossy light and soft rings, like a printed gift card. */}
      <span aria-hidden className="absolute -right-[12cqw] -top-[30cqw] h-[62cqw] w-[62cqw] rounded-full bg-white/[0.13]" />
      <span aria-hidden className="absolute -right-[2cqw] -top-[20cqw] h-[42cqw] w-[42cqw] rounded-full border-[0.6cqw] border-white/15" />
      <span aria-hidden className="absolute -bottom-[26cqw] -left-[14cqw] h-[48cqw] w-[48cqw] rounded-full bg-black/[0.12]" />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/[0.14] via-transparent to-transparent" />

      <div className="absolute inset-x-0 top-0 flex h-[70%] flex-col justify-between p-[4.5cqw] pb-[3cqw]">
        <div className="flex items-start justify-between gap-[2cqw]">
          <span className="flex min-w-0 items-center gap-[2cqw]">
            <span
              className="grid h-[9cqw] w-[9cqw] shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,.25)]"
              style={{ color: theme.accent }}
            >
              <Icon className="h-[5.4cqw] w-[5.4cqw]" />
            </span>
            <span className="truncate text-[6.4cqw] font-extrabold tracking-tight drop-shadow-sm">{brand}</span>
          </span>
          <span className="shrink-0 rounded-full bg-black/25 px-[2.6cqw] py-[0.9cqw] text-[3.3cqw] font-semibold ring-1 ring-white/25 backdrop-blur-sm">
            {kind}
          </span>
        </div>
        <p
          className="self-end font-black leading-none tracking-tight tabular-nums [text-shadow:0_0.6cqw_0_rgba(0,0,0,.28),0_0_3cqw_rgba(0,0,0,.18)]"
          style={{ fontSize: `${amountFontSize(label)}cqw` }}
        >
          {label}
        </p>
      </div>

      {/* The tear-off stub, below the notches. */}
      <div className="absolute inset-x-0 bottom-0 flex h-[30%] items-center justify-between gap-[2cqw] bg-white/95 px-[4.5cqw]">
        <span className="truncate text-[4.4cqw] font-bold" style={{ color: theme.accent }}>
          {brand} {amount}
        </span>
        <span className="shrink-0 text-[3.3cqw] font-medium text-[#3d4a44]">
          {isCash ? "Sent to Your Number" : "Code in Your History"}
        </span>
      </div>
    </div>
  );
}
