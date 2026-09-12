import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { getDeclarationBundle } from "@/lib/declarationBundle";
import ProfDeclarationForm from "@/components/ProfDeclarationForm";

export default async function ProfPage() {
  const teacher = await requireTeacher();
  if (!teacher) redirect("/connexion");
  if (teacher.mustResetPwd) redirect("/prof/mot-de-passe");

  const bundle = await getDeclarationBundle(teacher.id, teacher.name, teacher.email);
  // Sérialise les Date en string pour matcher exactement la forme JSON
  // renvoyée par GET /api/declarations (utilisée après chaque rafraîchissement
  // côté client) — évite un mismatch de type Date vs string.
  const serialized = JSON.parse(JSON.stringify(bundle));

  return <ProfDeclarationForm initialBundle={serialized} />;
}
