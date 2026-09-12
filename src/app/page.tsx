import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (session.userType === "teacher") redirect("/prof");
  if (session.userType === "admin") redirect("/admin");
  redirect("/connexion");
}
