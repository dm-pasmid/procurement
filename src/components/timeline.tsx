import { cn } from "@/lib/utils";

export interface TimelineEvent {
  id: string;
  title: string;
  subtitle?: string;
  remarks?: string;
  date?: Date | null;
  tone?: "default" | "success" | "warning" | "danger" | "pending";
}

const DOT_TONE: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  default: "bg-primary",
  success: "bg-primary",
  warning: "bg-warning",
  danger: "bg-critical",
  pending: "border-2 border-dashed border-muted-foreground bg-background",
};

/**
 * Vertical document timeline (created → submitted → approvals → procurement
 * → SO → GRN → bill → payment). Later phases append events.
 */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative ml-2 space-y-5 border-l border-border pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[26.5px] top-1 size-3 rounded-full",
              DOT_TONE[event.tone ?? "default"],
            )}
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p
              className={cn(
                "text-sm font-medium",
                event.tone === "pending" && "text-muted-foreground",
              )}
            >
              {event.title}
            </p>
            {event.date && (
              <time className="text-xs text-muted-foreground">
                {event.date.toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            )}
          </div>
          {event.subtitle && (
            <p className="text-xs text-muted-foreground">{event.subtitle}</p>
          )}
          {event.remarks && (
            <p className="mt-0.5 text-xs italic text-muted-foreground">
              “{event.remarks}”
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
