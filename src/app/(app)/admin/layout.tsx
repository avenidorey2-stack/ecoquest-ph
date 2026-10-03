import AdminNav from "@/components/admin/AdminNav";

// Access control lives in each page (requireAdminPage) — layouts don't re-run on client navigation.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col text-slate-900">
      <AdminNav />
      {/* The admin page's own sections scroll-reveal (ScrollReveal), not this whole wrapper. */}
      <div className="flex flex-1 flex-col" data-reveal-root>
        {children}
      </div>
    </div>
  );
}
