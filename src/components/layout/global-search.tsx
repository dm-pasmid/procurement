"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchAction } from "@/app/(app)/search-actions";
import type { SearchHit } from "@/lib/search";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const results = await searchAction(query);
        setHits(results);
        setOpen(true);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(href);
  }

  // Group hits by group label for display.
  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.group] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div ref={boxRef} className="relative hidden w-72 md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder="Search number, vendor, item…"
        aria-label="Global search"
        className="h-9 pl-8"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-96 w-96 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {hits.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No matches for “{query.trim()}”.</p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                {items.map((h, i) => (
                  <button
                    key={group + i}
                    type="button"
                    onClick={() => go(h.href)}
                    className={cn(
                      "block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span className="font-medium">{h.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{h.sublabel}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
