import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const url = `${process.env.APP_URL || "http://localhost:3000"}/connexion`;
  const buffer = await QRCode.toBuffer(url, { width: 480, margin: 2 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="qr-code-dancearea-decompte.png"',
    },
  });
}
