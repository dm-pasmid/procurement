import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Account disabled" };

export default async function AccountDisabledPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.active) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm border-t-4 border-t-destructive text-center">
        <CardHeader>
          <CardTitle className="text-destructive">Account disabled</CardTitle>
          <CardDescription>
            Your account ({user.email}) has been deactivated. Contact the
            system administrator (IT Cell) to restore access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
