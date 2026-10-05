import { requireAdminPage } from "@/lib/authz";
import { getUsersByLocation } from "@/lib/admin-users";
import UserDirectory from "@/components/admin/UserDirectory";

export default async function AdminUsersPage() {
  await requireAdminPage();

  const groups = await getUsersByLocation();
  const total = groups.reduce((n, g) => n + g.users.length, 0);
  const located = groups.filter((g) => g.cityCode);
  const noLocation = groups.find((g) => !g.cityCode)?.users.length ?? 0;

  const stats = [
    { label: "Total Users", value: total },
    { label: "Cities & Towns", value: located.length },
    { label: "No Location Yet", value: noLocation },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Users</h2>
        <p className="text-sm text-ink-3">Registered planters grouped by the city or town on their profile.</p>
      </div>
      <ul className="eq-stagger eq-spring grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <li key={s.label} className="eq-panel rounded-2xl border border-line/80 bg-card p-4 shadow-sm">
            <p className="text-2xl font-bold tracking-tight text-ink">{s.value.toLocaleString("en-PH")}</p>
            <p className="text-xs font-medium text-ink-2 sm:text-sm">{s.label}</p>
          </li>
        ))}
      </ul>
      <UserDirectory groups={groups} />
    </div>
  );
}
