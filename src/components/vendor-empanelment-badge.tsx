import { Badge } from "@/components/ui/badge";

/**
 * Shared empanelment status badge. Use everywhere a vendor appears:
 * amber when the empanelment has expired, secondary when valid.
 */
export function VendorEmpanelmentBadge({
  empanelled,
  validTill,
}: {
  empanelled: boolean;
  /** ISO date string or Date; null = no expiry recorded */
  validTill: string | Date | null;
}) {
  if (!empanelled) return null;

  const expired =
    validTill !== null && new Date(validTill).getTime() < Date.now();

  if (expired) {
    return (
      <Badge className="bg-warning text-warning-foreground">
        Empanelment expired
      </Badge>
    );
  }
  return <Badge variant="secondary">Empanelled</Badge>;
}
