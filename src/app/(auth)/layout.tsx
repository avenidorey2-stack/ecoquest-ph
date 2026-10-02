import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-green-50 px-4 py-10 text-gray-900">
      <Link href="/" className="mb-6 text-2xl font-bold text-green-700">
        🌱 EcoQuest PH
      </Link>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">{children}</div>
    </div>
  );
}
