import { requireAdminPage } from "@/lib/authz";
import { loadAdminSlotData } from "@/lib/admin-slots";
import SlotManager from "@/components/admin/SlotManager";

export default async function AdminSlotsPage({ searchParams }: PageProps<"/admin/slots">) {
  await requireAdminPage();
  const { edit } = await searchParams;
  const { regions, species, slots } = await loadAdminSlotData();
  return (
    <SlotManager
      regions={regions}
      species={species}
      slots={slots}
      initialEditId={typeof edit === "string" ? edit : undefined}
    />
  );
}
