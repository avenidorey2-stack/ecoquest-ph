import AdminNav from "@/components/admin/AdminNav";

// Access control lives in each page (requireAdminPage) — layouts don't re-run on client navigation.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col text-slate-900">
      <AdminNav />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
