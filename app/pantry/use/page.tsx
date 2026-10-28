import PantryQuickUse from "@/components/pantry-quick-use";

export const instant = false;

export default async function PantryQuickUsePage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const params = await searchParams;
  return <PantryQuickUse itemId={params.item ?? ""} />;
}
