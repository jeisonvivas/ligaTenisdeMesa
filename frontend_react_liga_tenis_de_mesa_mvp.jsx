import React, { useEffect, useMemo, useState } from "react";

/**
 * Frontend MVP — Liga Tenis de Mesa
 * - Lista de torneos
 * - Bracket por rondas
 * - Cargar resultado (POST /matches/:id/resultado)
 * - Ranking por categoría
 *
 * Ajusta BASE_URL si tu API no corre en 127.0.0.1:4000
 */
const BASE_URL_DEFAULT = "http://127.0.0.1:4000";

// ------------------------------------ Utilidades
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ------------------------------------ Componentes UI simples
function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

function Button({ children, className = "", ...props }) {
  return (
    <button
      className={
        "rounded-2xl px-3 py-2 shadow-sm border hover:shadow transition disabled:opacity-50 disabled:cursor-not-allowed " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}

function Card({ title, children, className = "" }) {
  return (
    <div className={"rounded-2xl border shadow-sm p-4 bg-white " + className}>
      {title ? (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{title}</h3>
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ------------------------------------ App principal
export default function App() {
  const [BASE_URL, setBASE_URL] = useState(BASE_URL_DEFAULT);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null); // obj torneo
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);

  const [tab, setTab] = useState("bracket"); // bracket | ranking

  const [ranking, setRanking] = useState([]);

  // Modal resultado
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMatch, setModalMatch] = useState(null);
  const [scoreA, setScoreA] = useState(3);
  const [scoreB, setScoreB] = useState(1);

  // Diccionario jugadorId -> nombre
  const nameById = useMemo(() => {
    const map = new Map();
    for (const p of players) map.set(String(p._id), p.nombre || "(sin nombre)");
    return map;
  }, [players]);

  // Cargar lista de jugadores (para mostrar nombres en el bracket)
  async function loadPlayers() {
    const data = await apiGet(`${BASE_URL}/players`);
    setPlayers(data);
  }

  // Cargar torneos
  async function loadTournaments() {
    const data = await apiGet(`${BASE_URL}/tournaments`);
    setTournaments(data);
  }

  // Cargar detalle del torneo y su bracket
  async function loadTournamentData(t) {
    setSelectedTournament(t);
    setError("");
    setLoading(true);
    try {
      const bracket = await apiGet(`${BASE_URL}/tournaments/${t._id}/bracket`);
      setMatches(bracket);
      // Ranking de la categoría del torneo
      const cat = t.categoria;
      const rk = await apiGet(`${BASE_URL}/ranking?categoria=${encodeURIComponent(cat || "")}`);
      setRanking(rk);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadPlayers();
        await loadTournaments();
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [BASE_URL]);

  function groupByRound(ms) {
    const by = new Map();
    for (const m of ms) {
      if (!by.has(m.ronda)) by.set(m.ronda, []);
      by.get(m.ronda).push(m);
    }
    // ordenar por ronda asc y slot asc
    const rounds = Array.from(by.keys()).sort((a, b) => a - b);
    return rounds.map((r) => ({
      ronda: r,
      items: by.get(r).sort((a, b) => (a.slot || 0) - (b.slot || 0)),
    }));
  }

  const rounds = useMemo(() => groupByRound(matches), [matches]);

  async function handleReportResult(match) {
    setModalMatch(match);
    setScoreA(3);
    setScoreB(1);
    setModalOpen(true);
  }

  async function submitResult() {
    if (!modalMatch) return;
    try {
      setLoading(true);
      setError("");
      await apiPost(`${BASE_URL}/matches/${modalMatch._id}/resultado`, { a: Number(scoreA), b: Number(scoreB) });
      // recargar bracket y ranking
      if (selectedTournament) await loadTournamentData(selectedTournament);
      setModalOpen(false);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const selectedCategory = selectedTournament?.categoria || "";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-bold">Liga TTM — Panel</div>
          <div className="ml-auto flex items-center gap-2">
            <input
              className="border rounded-xl px-3 py-1 text-sm w-[320px]"
              value={BASE_URL}
              onChange={(e) => setBASE_URL(e.target.value)}
              placeholder="http://127.0.0.1:4000"
              title="URL de tu API"
            />
            <Badge>API</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-4">
        {/* Sidebar: torneos */}
        <aside className="col-span-12 md:col-span-3">
          <Card title="Torneos">
            <div className="flex flex-col gap-2">
              {tournaments.length === 0 && <div className="text-sm text-gray-500">No hay torneos. Crea uno por API.</div>}
              {tournaments.map((t) => (
                <Button
                  key={t._id}
                  className={
                    "justify-start w-full " +
                    (selectedTournament?._id === t._id ? "bg-gray-900 text-white" : "bg-white")
                  }
                  onClick={() => loadTournamentData(t)}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{t.nombre}</span>
                    <span className="text-xs opacity-70">{t.categoria} · {new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </Button>
              ))}
            </div>
          </Card>
        </aside>

        {/* Main */}
        <section className="col-span-12 md:col-span-9 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button className={tab === "bracket" ? "bg-gray-900 text-white" : "bg-white"} onClick={() => setTab("bracket")}>Bracket</Button>
            <Button className={tab === "ranking" ? "bg-gray-900 text-white" : "bg-white"} onClick={() => setTab("ranking")}>Ranking</Button>
            {selectedTournament && (
              <Badge>Categoria: {selectedCategory || "—"}</Badge>
            )}
            {loading && <span className="ml-auto text-sm">Cargando…</span>}
          </div>

          {error && (
            <Card>
              <div className="text-sm text-red-600 whitespace-pre-wrap">{String(error)}</div>
            </Card>
          )}

          {!selectedTournament && (
            <Card>
              <div className="text-sm text-gray-600">Selecciona un torneo en la izquierda para ver su cuadro y ranking.</div>
            </Card>
          )}

          {selectedTournament && tab === "bracket" && (
            <Card title={`Bracket — ${selectedTournament?.nombre || ""}`}>
              {rounds.length === 0 ? (
                <div className="text-sm text-gray-500">No hay partidos generados. Usa POST /tournaments/:id/generar-llaves.</div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))` }}>
                  {rounds.map((col) => (
                    <div key={col.ronda} className="flex flex-col gap-3">
                      <div className="text-sm font-semibold">Ronda {col.ronda}</div>
                      {col.items.map((m) => {
                        const nameA = m.jugadorA ? nameById.get(String(m.jugadorA)) || m.jugadorA : "BYE";
                        const nameB = m.jugadorB ? nameById.get(String(m.jugadorB)) || m.jugadorB : "BYE";
                        const isComplete = Boolean(m.jugadorA && m.jugadorB);
                        const isPlayed = m.estado === "jugado";
                        const ganador = m.ganadorId ? nameById.get(String(m.ganadorId)) || m.ganadorId : null;
                        return (
                          <div key={m._id} className={"rounded-xl border p-3 bg-white " + (isPlayed ? "opacity-90" : "") }>
                            <div className="text-xs text-gray-500 mb-1">Slot {m.slot}</div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate"><span className="font-medium">{nameA}</span></div>
                              <div className="text-sm">{m.marcador?.a ?? 0}</div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <div className="truncate"><span className="font-medium">{nameB}</span></div>
                              <div className="text-sm">{m.marcador?.b ?? 0}</div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              {ganador && <Badge>Ganador: {ganador}</Badge>}
                              {!isPlayed && isComplete && (
                                <Button className="ml-auto" onClick={() => handleReportResult(m)}>Cargar resultado</Button>
                              )}
                              {!isComplete && <span className="text-xs text-gray-500 ml-auto">Pendiente</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {selectedTournament && tab === "ranking" && (
            <Card title={`Ranking — ${selectedCategory || ""}`}>
              {ranking.length === 0 ? (
                <div className="text-sm text-gray-500">Sin registros para esta categoría.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">#</th>
                        <th className="py-2 pr-4">Jugador</th>
                        <th className="py-2 pr-4">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, idx) => (
                        <tr key={r._id} className="border-t">
                          <td className="py-2 pr-4">{idx + 1}</td>
                          <td className="py-2 pr-4">{r.playerId?.nombre || r.playerId || '—'}</td>
                          <td className="py-2 pr-4 font-semibold">{r.puntos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </section>
      </main>

      {/* Modal resultado */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg">Cargar resultado</h3>
              <button className="text-gray-500" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            {modalMatch && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">Ronda {modalMatch.ronda} · Slot {modalMatch.slot}</div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <div className="text-sm mb-1 font-medium">A</div>
                    <input type="number" className="w-full border rounded-xl px-3 py-2" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
                  </div>
                  <div>
                    <div className="text-sm mb-1 font-medium">B</div>
                    <input type="number" className="w-full border rounded-xl px-3 py-2" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                  <Button className="bg-gray-900 text-white" onClick={submitResult}>Guardar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
