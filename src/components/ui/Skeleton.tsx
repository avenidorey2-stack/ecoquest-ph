// Skeleton loading screens (route `loading.tsx` files). They show instantly while a page's data
// streams in — most noticeable on a weak signal — in the shape of the page that's coming, so the
// layout doesn't jump when it arrives. One opacity pulse on the wrapper (GPU, no per-block
// animations); still under reduced motion. `data-reveal-skip` keeps ScrollReveal off them.

/** A placeholder block; rounded-lg unless `className` sets its own rounding. */
function Bone({ className = "" }: { className?: string }) {
  return <div className={`${/rounded-/.test(className) ? "" : "rounded-lg "}bg-card-3/80 ${className}`} />;
}

function Card({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card/90 p-5 ${className}`}>{children}</div>;
}

/** A card with a small title and a few text lines. */
function TextCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <Card className={className}>
      <Bone className="h-3 w-28" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Bone key={i} className={`h-3.5 ${["w-full", "w-5/6", "w-2/3", "w-3/4"][i % 4]}`} />
        ))}
      </div>
    </Card>
  );
}

function Stat() {
  return (
    <Card className="p-4">
      <Bone className="mx-auto h-6 w-14" />
      <Bone className="mx-auto mt-2.5 h-2.5 w-20" />
    </Card>
  );
}

function Shell({ width, children }: { width: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      data-reveal-skip
      className={`mx-auto w-full ${width} space-y-6 px-4 py-6 motion-safe:animate-pulse sm:px-6 lg:px-8`}
    >
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** Dashboard: card grid with the tall map card. */
export function DashboardSkeleton() {
  return (
    <Shell width="max-w-[1400px]">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <TextCard lines={2} />
        <TextCard lines={2} />
        <TextCard lines={4} />
        <Card className="md:col-span-2">
          <Bone className="h-3 w-40" />
          <Bone className="mt-5 h-64 w-full rounded-xl sm:h-80" />
        </Card>
        <TextCard lines={4} />
        <TextCard lines={3} />
        <TextCard lines={3} />
        <TextCard lines={3} />
      </div>
    </Shell>
  );
}

/** Narrow pages (leaderboard, rewards, transactions, referrals, admin): heading, stats, rows. */
export function ListSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <Shell width="max-w-3xl">
      <div className="space-y-2.5">
        <Bone className="h-6 w-48" />
        <Bone className="h-3.5 w-72 max-w-full" />
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Stat />
          <Stat />
          <Stat />
        </div>
      )}
      <Card className="space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Bone className="h-3.5 w-2/5" />
              <Bone className="h-2.5 w-3/5" />
            </div>
            <Bone className="h-6 w-14 rounded-full" />
          </div>
        ))}
      </Card>
    </Shell>
  );
}

/** Image-card grids (shop, tree directory, achievements): banner + cards. */
export function GridSkeleton({ banner = true }: { banner?: boolean }) {
  return (
    <Shell width="max-w-7xl">
      {banner && (
        <Card className="space-y-3">
          <Bone className="h-6 w-56 max-w-full" />
          <Bone className="h-3.5 w-80 max-w-full" />
        </Card>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-card/90">
            <Bone className="aspect-[4/5] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Bone className="h-3.5 w-3/4" />
              <Bone className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Profiles: avatar header, stats, photo grid. */
export function ProfileSkeleton() {
  return (
    <Shell width="max-w-2xl">
      <Card className="flex items-center gap-4">
        <Bone className="h-16 w-16 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <Bone className="h-5 w-40" />
          <Bone className="h-3 w-28" />
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-3">
        <Stat />
        <Stat />
        <Stat />
      </div>
      <Card>
        <Bone className="h-3 w-28" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      </Card>
    </Shell>
  );
}
