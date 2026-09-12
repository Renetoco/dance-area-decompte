"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CourseRow = {
  id: string;
  code: string;
  categorie: string;
  nomCours: string;
  jour: string | null;
  heureDebut: string | null;
  heureFin: string | null;
  teacher: { id: string; name: string } | null;
  _count: { participants: number };
};

export default function AdminCourses() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      fetch(`/api/admin/courses?${params}`)
        .then((r) => r.json())
        .then((d) => setCourses(d.courses ?? []))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="filters">
        <input
          placeholder="Rechercher un cours, un code, un·e prof..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <p className="muted">Chargement...</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Cours</th>
              <th>Catégorie</th>
              <th>Jour</th>
              <th>Horaire</th>
              <th>Titulaire</th>
              <th>Participant·es</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="is-clickable">
                <td className="muted">{c.code}</td>
                <td>
                  <Link href={`/admin/cours/${c.id}`}>{c.nomCours}</Link>
                </td>
                <td>{c.categorie}</td>
                <td>{c.jour ?? "—"}</td>
                <td>{c.heureDebut ? `${c.heureDebut} – ${c.heureFin ?? ""}` : "—"}</td>
                <td>
                  {c.teacher ? <Link href={`/admin/profs/${c.teacher.id}`}>{c.teacher.name}</Link> : "—"}
                </td>
                <td>{c._count.participants > 0 ? `${c._count.participants}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && courses.length === 0 && <p className="muted">Aucun cours ne correspond à cette recherche.</p>}
    </div>
  );
}
