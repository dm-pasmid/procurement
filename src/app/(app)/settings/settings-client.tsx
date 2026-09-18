"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateSetting } from "./actions";

export interface SettingRow {
  key: string;
  value: string;
  description: string;
}

export function SettingsClient({ settings }: { settings: SettingRow[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function save(key: string) {
    const value = drafts[key];
    if (value === undefined) return;
    startTransition(async () => {
      const result = await updateSetting({ key, value });
      if (result.ok) {
        toast.success(`${key} updated`);
        setDrafts((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        });
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-56">Key</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-36">Value</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {settings.map((setting) => {
            const draft = drafts[setting.key];
            const dirty = draft !== undefined && draft !== setting.value;
            return (
              <TableRow key={setting.key}>
                <TableCell className="font-mono text-xs">
                  {setting.key}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {setting.description}
                </TableCell>
                <TableCell>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (dirty) save(setting.key);
                    }}
                  >
                    <Input
                      value={draft ?? setting.value}
                      inputMode="decimal"
                      aria-label={`Value for ${setting.key}`}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [setting.key]: e.target.value,
                        }))
                      }
                    />
                  </form>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    disabled={!dirty || isPending}
                    onClick={() => save(setting.key)}
                  >
                    Save
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
