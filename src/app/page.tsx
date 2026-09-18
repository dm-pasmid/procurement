import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { homeRoute } from "@/lib/authz";

export default async function Home() {
  const user = await requireUser();
  redirect(homeRoute(user.role));
}
