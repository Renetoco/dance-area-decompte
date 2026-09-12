"use client";

import { useState } from "react";

export default function AdminImport() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/admin/import-cours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de l'import.");
        return;
      }
      setResult(
        `${data.teachersCreated} nouveau(x) prof(s), ${data.coursesImported} cours importés (${data.coursesSkipped} ignorés, sans prof rattaché).`
      );
    } catch (err) {
      setError("Fichier JSON invalide.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="card">
      <p className="muted">
        Convertissez d'abord le fichier Excel du planning avec{" "}
        <code>scripts/parse-cours.py</code> (voir DEPLOIEMENT.md), puis importez le
        fichier <code>cours.json</code> obtenu ici. Opération sans risque : elle ne fait
        que créer/mettre à jour les profs et les cours, jamais de suppression.
      </p>
      <input type="file" accept="application/json" onChange={handleFile} disabled={busy} />
      {busy && <p className="muted">Import en cours...</p>}
      {error && <div className="error-msg">{error}</div>}
      {result && <div className="success-msg">{result}</div>}
    </div>
  );
}
