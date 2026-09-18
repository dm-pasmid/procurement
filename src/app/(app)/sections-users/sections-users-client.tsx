"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createUser,
  saveSection,
  setSectionActive,
  setUserActive,
  updateUser,
  resetUserPassword,
} from "./actions";

const ROLES: Role[] = [
  "INITIATOR",
  "OC",
  "ADM",
  "DM",
  "NDC",
  "NEZARATH_CLERK",
  "ADMIN",
];

export interface SectionRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  designation: string;
  role: Role;
  sectionId: string;
  sectionName: string;
  active: boolean;
  /** For ADM users: sections they are in charge of. */
  admSectionIds: string[];
  admSectionCodes: string[];
}

export function SectionsUsersClient({
  sections,
  users,
  currentUserId,
}: {
  sections: SectionRow[];
  users: UserRow[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <UsersCard sections={sections} users={users} currentUserId={currentUserId} />
      <SectionsCard sections={sections} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersCard({
  sections,
  users,
  currentUserId,
}: {
  sections: SectionRow[];
  users: UserRow[];
  currentUserId: string;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [sectionId, setSectionId] = useState("");
  const [admSectionIds, setAdmSectionIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setRole("");
    setSectionId("");
    setAdmSectionIds([]);
    setDialogOpen(true);
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    setRole(user.role);
    setSectionId(user.sectionId);
    setAdmSectionIds(user.admSectionIds);
    setDialogOpen(true);
  }

  function openResetPassword(user: UserRow) {
    setResetPasswordUser(user);
    setNewPassword("");
    setResetPasswordDialog(true);
  }

  function toggleAdmSection(id: string, checked: boolean) {
    setAdmSectionIds((prev) =>
      checked ? [...prev, id] : prev.filter((s) => s !== id),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    startTransition(async () => {
      const result = editing
        ? await updateUser({
            id: editing.id,
            name: text("name"),
            designation: text("designation"),
            role,
            sectionId,
            admSectionIds: role === "ADM" ? admSectionIds : [],
          })
        : await createUser({
            email: text("email"),
            password: text("password"),
            name: text("name"),
            designation: text("designation"),
            role,
            sectionId,
            admSectionIds: role === "ADM" ? admSectionIds : [],
          });
      if (result.ok) {
        toast.success(editing ? "User updated" : "User created");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetPasswordUser) return;
    startTransition(async () => {
      const result = await resetUserPassword(resetPasswordUser.id, newPassword);
      if (result.ok) {
        toast.success(`Password reset for ${resetPasswordUser.name}`);
        setResetPasswordDialog(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleActive(user: UserRow, active: boolean) {
    startTransition(async () => {
      const result = await setUserActive(user.id, active);
      if (result.ok) {
        toast.success(active ? "User activated" : "User deactivated");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            One role per user. Deactivated users cannot sign in.
          </CardDescription>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New user
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.designation}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.sectionName}
                    {user.role === "ADM" && (
                      <span className="block text-xs text-muted-foreground">
                        {user.admSectionCodes.length > 0
                          ? `In charge: ${user.admSectionCodes.join(", ")}`
                          : "In charge: all unmapped sections"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit user"
                        onClick={() => openEdit(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Reset password"
                        onClick={() => openResetPassword(user)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={user.active}
                        disabled={isPending || user.id === currentUserId}
                        onCheckedChange={(v) => toggleActive(user, v)}
                        aria-label={`${user.active ? "Deactivate" : "Activate"} ${user.name}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "New user"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update profile, role and section."
                : "Creates a Supabase Auth account and linked profile."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="u-email">Email</Label>
                  <Input id="u-email" name="email" type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-password">Initial password</Label>
                  <Input
                    id="u-password"
                    name="password"
                    type="password"
                    minLength={8}
                    required
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Name</Label>
                <Input
                  id="u-name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-designation">Designation</Label>
                <Input
                  id="u-designation"
                  name="designation"
                  defaultValue={editing?.designation ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as Role)}
                  required
                >
                  <SelectTrigger id="u-role" className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-section">Section</Label>
                <Select value={sectionId} onValueChange={setSectionId} required>
                  <SelectTrigger id="u-section" className="w-full">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections
                      .filter((s) => s.active)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {role === "ADM" && (
              <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
                <Label>Sections in charge</Label>
                <p className="text-xs text-muted-foreground">
                  This ADM approves requisitions from the ticked sections.
                  Sections mapped to no ADM are visible to every ADM.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {sections
                    .filter((s) => s.active)
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={admSectionIds.includes(s.id)}
                          onCheckedChange={(v) =>
                            toggleAdmSection(s.id, v === true)
                          }
                          aria-label={`In charge of ${s.name}`}
                        />
                        {s.name} ({s.code})
                      </label>
                    ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !role || !sectionId}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordUser?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New Password</Label>
              <Input
                id="reset-password"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters long
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetPasswordDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || newPassword.length < 8}>
                {isPending ? "Resetting…" : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionsCard({ sections }: { sections: SectionRow[] }) {
  const [editing, setEditing] = useState<SectionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(section: SectionRow) {
    setEditing(section);
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveSection({
        id: editing?.id,
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
      });
      if (result.ok) {
        toast.success(editing ? "Section updated" : "Section created");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleActive(section: SectionRow, active: boolean) {
    startTransition(async () => {
      const result = await setSectionActive(section.id, active);
      if (result.ok) {
        toast.success(active ? "Section activated" : "Section deactivated");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Sections</CardTitle>
          <CardDescription>
            Office sections. Deactivated sections stay on past records.
          </CardDescription>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New section
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="font-mono text-xs">
                    {section.code}
                  </TableCell>
                  <TableCell className="font-medium">{section.name}</TableCell>
                  <TableCell>
                    {section.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${section.name}`}
                        onClick={() => openEdit(section)}
                      >
                        <Pencil />
                      </Button>
                      <Switch
                        checked={section.active}
                        disabled={isPending}
                        onCheckedChange={(v) => toggleActive(section, v)}
                        aria-label={`${section.active ? "Deactivate" : "Activate"} ${section.name}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit section" : "New section"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the section record."
                : "Add an office section."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-[8rem_1fr] gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-code">Code</Label>
                <Input
                  id="s-code"
                  name="code"
                  maxLength={10}
                  defaultValue={editing?.code ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-name">Name</Label>
                <Input
                  id="s-name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
