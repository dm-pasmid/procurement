import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  breadcrumb,
  action,
}: {
  title: string;
  breadcrumb?: Crumb[];
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="hover:text-primary hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-primary">
          {title}
        </h1>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <Separator className="mt-3" />
    </div>
  );
}
