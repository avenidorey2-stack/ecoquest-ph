import Link from "next/link";

export default function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-4xl" aria-hidden>
          🌱
        </p>
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
        <Link href="/dashboard" className="mt-5 inline-block rounded bg-green-600 px-4 py-2 text-sm font-medium text-white">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
