"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Connexion impossible.");
        return;
      }
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotMessage(null);
    const res = await fetch("/api/auth/mot-de-passe-oublie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setForgotMessage(data.message || "Si un compte existe, un email a été envoyé.");
  }

  return (
    <main className="page" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100vh" }}>
      <div className="card">
        <h1>Dance Area</h1>
        <p className="muted">Décompte mensuel des cours</p>

        {!showForgot ? (
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <div className="error-msg">{error}</div>}
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="btn secondary"
              style={{ marginTop: 10 }}
            >
              Mot de passe oublié
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot}>
            <label htmlFor="email2">Email</label>
            <input
              id="email2"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {forgotMessage && <div className="success-msg">{forgotMessage}</div>}
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn">
                Recevoir un nouveau mot de passe
              </button>
            </div>
            <button type="button" onClick={() => setShowForgot(false)} className="btn secondary" style={{ marginTop: 10 }}>
              Retour
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
