import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  return NextResponse.json({ name: admin.name, role: admin.role, email: admin.email });
}
