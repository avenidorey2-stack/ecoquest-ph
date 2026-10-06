/** Loading placeholder shaped like a chat (full screen on phones, like ChatFrame). */
export default function ChatSkeleton() {
  const bubble = "h-9 animate-pulse rounded-2xl bg-card-3";
  return (
    <div
      aria-label="Loading"
      className="fixed inset-x-0 top-0 z-[1150] flex h-dvh flex-col bg-canvas lg:relative lg:z-auto lg:mx-auto lg:h-[calc(100dvh-8rem)] lg:w-full lg:max-w-3xl lg:bg-transparent lg:px-6 lg:py-4"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-2xl lg:border lg:border-line/80 lg:bg-card">
        <div className="flex items-center gap-3 border-b border-line bg-card px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:pt-2">
          <div className="h-11 w-11" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-card-3" />
          <div className="h-4 w-32 animate-pulse rounded bg-card-3" />
        </div>
        <div className="flex flex-1 flex-col justify-end gap-2 p-4">
          <div className={`${bubble} w-40`} />
          <div className={`${bubble} w-56 self-end bg-emerald-400/20`} />
          <div className={`${bubble} w-32`} />
          <div className={`${bubble} w-48 self-end bg-emerald-400/20`} />
        </div>
        <div className="border-t border-line bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="h-11 animate-pulse rounded-full bg-card-2" />
        </div>
      </div>
    </div>
  );
}
