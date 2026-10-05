"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Something Went Wrong</h1>
        <p className="mt-2 text-sm text-ink-3">Please try again. If the problem continues, contact support.</p>
        <button onClick={reset} className="mt-5 rounded bg-emerald-400 px-4 py-2 text-sm font-medium text-emerald-950">
          Try Again
        </button>
      </div>
    </div>
  );
}
