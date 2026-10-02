"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-500">Please try again. If the problem continues, contact support.</p>
        <button onClick={reset} className="mt-5 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
      </div>
    </div>
  );
}
