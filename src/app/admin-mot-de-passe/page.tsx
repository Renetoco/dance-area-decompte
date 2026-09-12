"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangerMotDePasseAdminPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/changer-mot-de-passe-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100vh" }}>
      <div className="card">
        <h1>Nouveau mot de passe</h1>
        <p className="muted">
          Première connexion (ou mot de passe réinitialisé) : choisissez un mot de passe personnel
          (au moins 8 caractères).
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="password">Nouveau mot de passe</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="confirm">Confirmer</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="error-msg">{error}</div>}
          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Enregistrement..." : "Valider"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
