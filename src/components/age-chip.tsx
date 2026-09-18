import { Badge } from "@/components/ui/badge";

/**
 * SLA ageing chip: green < half the SLA, amber up to the SLA, red beyond
 * (default APPROVAL_SLA_HOURS=48 → green <24h, amber 24–48h, red >48h).
 */
export function AgeChip({
  since,
  slaHours,
}: {
  since: Date;
  slaHours: number;
}) {
  const hours = (Date.now() - since.getTime()) / (60 * 60 * 1000);
  const label =
    hours < 1
      ? "<1h"
      : hours < 48
        ? `${Math.floor(hours)}h`
        : `${Math.floor(hours / 24)}d`;

  const className =
    hours > slaHours
      ? "bg-critical text-critical-foreground"
      : hours >= slaHours / 2
        ? "bg-warning text-warning-foreground"
        : "bg-primary/10 text-primary";

  return <Badge className={`border-transparent tabular-nums ${className}`}>{label}</Badge>;
}
