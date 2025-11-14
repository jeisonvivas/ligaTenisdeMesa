// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import logoLiga from "./assets/logo-liga-meta.png";


/**
 * Panel Liga TTM (Frontend)
 * - Lista torneos (GET /tournaments)
 * - Ver bracket (GET /tournaments/:id/bracket)
 * - Generar llaves (POST /tournaments/:id/generar-llaves)
 * - Resetear bracket (DELETE /tournaments/:id/bracket)
 * - Reportar resultado (POST /matches/:id/resultado)
 * - Ver ranking (GET /ranking?categoria=...)
 * - CREAR JUGADOR (POST /players)  ← NUEVO
 */

const BASE_URL_DEFAULT = "http://127.0.0.1:4000";

/* ------------------------ helpers HTTP sencillos ------------------------ */
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = "Error en la petición";
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
    } catch {
      msg = await res.text();
    }
    throw new Error(msg);
  }

  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ------------------------- componentes base de UI ------------------------ */
function Button({ children, className = "", ...props }) {
  return (
    <button
      className={
        "rounded-2xl border px-3 py-2 shadow-sm hover:shadow transition disabled:opacity-50 " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}
function Card({ title, children }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      {title ? <h3 className="mb-3 font-semibold text-lg">{title}</h3> : null}
      {children}
    </div>
  );
}
function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}
/* --- Diálogo simple para notificaciones (éxito / alerta / error) --- */
function InfoDialog({ open, onClose, title, message, tone = "default" }) {
  if (!open) return null;
  const toneClasses =
    tone === "success"
      ? "border-emerald-300"
      : tone === "warn"
      ? "border-amber-300"
      : tone === "error"
      ? "border-rose-300"
      : "border-gray-200";

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-2xl border ${toneClasses} shadow-xl w-full max-w-md p-5`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end mt-4">
          <button className="rounded-2xl border px-3 py-2 shadow-sm bg-gray-900 text-white" onClick={onClose}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}


/* ------------------------ utilidades de presentación ---------------------- */
function fmtDate(d) {
  if (!d) return "Sin fecha";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "Sin fecha" : dt.toLocaleDateString();
}

/* --------------------------------- APP ---------------------------------- */
export default function App() { 
  // URL de la API (editable en el header)
  const [BASE_URL, setBASE_URL] = useState(BASE_URL_DEFAULT);

  // Estado global de la página
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Datos
  const [players, setPlayers] = useState([]); // para resolver nombres en bracket
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [ranking, setRanking] = useState([]);

  // UI
  const [tab, setTab] = useState("bracket"); // "bracket" | "ranking"

  // Modal de resultado
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMatch, setModalMatch] = useState(null);
  const [scoreA, setScoreA] = useState(3);
  const [scoreB, setScoreB] = useState(1);

  // -------- NUEVO: modal + formulario para "Crear jugador" ----------
  const [nuevoJugadorOpen, setNuevoJugadorOpen] = useState(false);
  const [nj, setNj] = useState({
    nombre: "",
    documento: "",
    edad: "",
    categoria: "Mayores", // Mayores | Sub-19
  });

  // Diálogo de notificación (éxito/alerta/error)
  const [toast, setToast] = useState({
  open: false,
  title: "",
  message: "",
  tone: "default", // "success" | "warn" | "error" | "default"
  });

 // --- Nuevo torneo (modal + formulario) ---
  const [nuevoTorneoOpen, setNuevoTorneoOpen] = useState(false);
  const [nt, setNt] = useState({
    nombre: "",
    categoria: "Mayores",              // Mayores | Sub-19 (ajusta a tus categorías)
    tipoLlave: "eliminacion_simple",   // por ahora solo este tipo
    fechaInicio: "",                    // yyyy-mm-dd
    fechaFin: ""                        // yyyy-mm-dd
  });

  // Modal para inscribir jugador
  const [inscribirOpen, setInscribirOpen] = useState(false);
  const [inscribirPlayerId, setInscribirPlayerId] = useState("");


  // --- Inscribir jugador en el torneo seleccionado ---
  // IDs de jugadores ya inscritos en el torneo seleccionado
 const inscritosIds = useMemo(() => {
  if (!selectedTournament || !Array.isArray(selectedTournament.jugadoresInscritos)) {
    return new Set();
  }
  return new Set(
    selectedTournament.jugadoresInscritos.map((j) =>
      String(j._id || j)      // sirve si vienen populados o como ObjectId plano
    )
  );
 }, [selectedTournament]);

  // Mapa id->nombre para resolver jugadores en el bracket
  const nameById = useMemo(() => {
    const m = new Map();
    for (const p of players) m.set(String(p._id), p.nombre || "(sin nombre)");
    return m;
  }, [players]);

    // --- Búsqueda de jugadores para la tarjeta ---
  const [playerQuery, setPlayerQuery] = useState("");

  // Lista filtrada por nombre (insensible a mayúsculas)
  const filteredPlayers = React.useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p => (p.nombre || "").toLowerCase().includes(q));
  }, [players, playerQuery]);


  /* --------------------------- carga inicial --------------------------- */
  useEffect(() => {
    (async () => {
      try {
        setError("");
        setLoading(true);
        const [playersRes, tournamentsRes] = await Promise.all([
          apiGet(`${BASE_URL}/players`),
          apiGet(`${BASE_URL}/tournaments`),
        ]);
        setPlayers(playersRes);
        setTournaments(tournamentsRes);
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [BASE_URL]);

  /* ---------------------- helpers por torneo activo --------------------- */
 async function loadTournamentData(tournamentObj) {
  setError("");
  setLoading(true);
  try {
    // 1) Traer detalle del torneo (con jugadores inscritos populados)
    const torneoDetalle = await apiGet(
      `${BASE_URL}/tournaments/${tournamentObj._id}`
    );

    // 2) Bracket
    const bracket = await apiGet(
      `${BASE_URL}/tournaments/${tournamentObj._id}/bracket`
    );

    // 3) Ranking
    const cat = torneoDetalle.categoria || "";
    const rk = await apiGet(
      `${BASE_URL}/ranking?categoria=${encodeURIComponent(cat)}`
    );

    setSelectedTournament(torneoDetalle);
    setMatches(bracket);
    setRanking(rk);
  } catch (e) {
    setError(String(e.message || e));
  } finally {
    setLoading(false);
  }
}


  async function handleGenerarLlaves() {
  if (!selectedTournament) return;

  try {
    setLoading(true);
    setError("");

    await apiPost(
      `${BASE_URL}/tournaments/${selectedTournament._id}/generar-llaves`
    );

    await loadTournamentData(selectedTournament);

    // Éxito
    setToast({
      open: true,
      title: "Llaves generadas",
      message: "Se generó el cuadro del torneo correctamente.",
      tone: "success",
    });
  } catch (e) {
    const msg = String(e.message || e);
    const pocosJugadores = msg.toLowerCase().includes("al menos 2 jugadores");

    setToast({
      open: true,
      title: pocosJugadores
        ? "No hay suficientes jugadores"
        : "Error al generar llaves",
      message: msg, // aquí verás "Se necesitan al menos 2 jugadores"
      tone: pocosJugadores ? "warn" : "error",
    });

    // ya NO usamos setError aquí para no pintar el JSON rojo
    // setError(msg); <-- lo dejamos fuera a propósito
  } finally {
    setLoading(false);
  }
}


  async function handleResetBracket() {
    if (!selectedTournament) return;
    if (!confirm("¿Borrar todos los partidos de este torneo?")) return;
    try {
      setLoading(true);
      setError("");
      await apiDelete(`${BASE_URL}/tournaments/${selectedTournament._id}/bracket`);
      await loadTournamentData(selectedTournament);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Vuelve a cargar la lista de jugadores desde la API
  async function reloadPlayers() {
    try {
      setLoading(true);
      setError("");
      const playersRes = await apiGet(`${BASE_URL}/players`); // GET /players
      setPlayers(playersRes);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function reloadTournaments(selectNewest = false) {
    try {
      setLoading(true);
      setError("");
      const tournamentsRes = await apiGet(`${BASE_URL}/tournaments`);
      setTournaments(tournamentsRes);

      if (selectNewest && tournamentsRes.length > 0) {
        // Asumiendo que vienen ordenados por createdAt desc (tu API lo hace)
        const newest = tournamentsRes[0];
        await loadTournamentData(newest);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function inscribirJugador() {
    // Validaciones rápidas en front
    if (!selectedTournament) {
      setToast({ open: true, title: "Selecciona un torneo", message: "Debes seleccionar un torneo para inscribir jugadores.", tone: "warn" });
      return;
    }
    if (!inscribirPlayerId) {
      setToast({ open: true, title: "Faltan datos", message: "Selecciona un jugador.", tone: "warn" });
      return;
    }

    try {
      setLoading(true);
      setError("");

      // POST /tournaments/:id/inscribir  { playerId }
      await apiPost(`${BASE_URL}/tournaments/${selectedTournament._id}/inscribir`, {
        playerId: inscribirPlayerId
      });

      // Cierra modal y limpia selección
      setInscribirOpen(false);
      setInscribirPlayerId("");

      // Refresca datos del torneo actual (para que luego “Generar llaves” tenga el listado al día)
      await loadTournamentData(selectedTournament);

      setToast({ open: true, title: "Inscripción exitosa", message: "Jugador inscrito en el torneo.", tone: "success" });
    } catch (e) {
      // Tu backend devuelve 400 con { error: 'Jugador ya inscrito' } si está repetido
      const raw = String(e.message || "").toLowerCase();
      const yaInscrito = raw.includes("ya inscrito");
      setToast({
        open: true,
        title: yaInscrito ? "Ya inscrito" : "Error al inscribir",
        message: yaInscrito ? "Este jugador ya está inscrito en el torneo." : String(e.message || e),
        tone: yaInscrito ? "warn" : "error",
      });
    } finally {
      setLoading(false);
    }
  }





  /* --------------------------- resultados --------------------------- */
  function openResultModal(match) {
    setModalMatch(match);
    setScoreA(3);
    setScoreB(1);
    setModalOpen(true);
  }
 async function submitResult() {
    if (!modalMatch) return;

    // Validación previa: no permitir empates
    if (Number(scoreA) === Number(scoreB)) {
      setToast({
        open: true,
        title: "Marcador no válido",
        message: "No puede haber empate: ajusta el resultado.",
        tone: "warn",
      });
      return;
    }

    try {
      setLoading(true);
      setError("");

      await apiPost(`${BASE_URL}/matches/${modalMatch._id}/resultado`, {
        a: Number(scoreA),
        b: Number(scoreB),
      });

      setModalOpen(false);

      setToast({
        open: true,
        title: "Resultado guardado",
        message: "El marcador se registró correctamente.",
        tone: "success",
      });

      if (selectedTournament) await loadTournamentData(selectedTournament);
    } catch (e) {
      const msg = String(e.message || e);

      setToast({
        open: true,
        title: "Error al guardar resultado",
        message: msg, // aquí llegaría "No puede haber empate..." si viene del backend
        tone: "error",
      });

      // 👇 ya NO usamos setError aquí, así que no sale JSON rojo
      // setError(msg);
    } finally {
      setLoading(false);
    }
}


  /* ----------------------- NUEVO: crear jugador ----------------------- */
 async function crearJugador() {
  // Validaciones mínimas de formulario (front)
  if (!nj.nombre.trim()) {
    setToast({
      open: true,
      title: "Faltan datos",
      message: "El nombre es obligatorio.",
      tone: "warn",
    });
    return;
  }
  if (nj.edad !== "" && Number(nj.edad) < 0) {
    setToast({
      open: true,
      title: "Edad inválida",
      message: "La edad no puede ser negativa.",
      tone: "warn",
    });
    return;
  }

  try {
    setLoading(true);
    setError("");

    await apiPost(`${BASE_URL}/players`, {
      ...nj,
      edad: nj.edad === "" ? undefined : Number(nj.edad),
    });

    // Cierra modal y limpia
    setNuevoJugadorOpen(false);
    setNj({ nombre: "", documento: "", edad: "", categoria: "Mayores" });

    // Refresca lista de jugadores
    const playersRes = await apiGet(`${BASE_URL}/players`);
    setPlayers(playersRes);

    // Éxito
    setToast({
      open: true,
      title: "Jugador creado",
      message: "Jugador creado con éxito.",
      tone: "success",
    });
  } catch (e) {
    // Detecta duplicado por mensaje del backend
    const raw = String(e.message || e).toLowerCase();
    const isDuplicate =
      raw.includes("duplicate key") ||
      raw.includes("e11000") ||
      raw.includes("ya existe") ||
      raw.includes("existe");

    setToast({
      open: true,
      title: isDuplicate ? "Jugador existente" : "Error al crear jugador",
      message: isDuplicate ? "Este jugador ya existe." : String(e.message || e),
      tone: isDuplicate ? "warn" : "error",
    });
  } finally {
    setLoading(false);
  }
}

async function crearTorneo() {
  // Validaciones simples en el front
  if (!nt.nombre.trim()) {
    setToast({ open: true, title: "Faltan datos", message: "El nombre del torneo es obligatorio.", tone: "warn" });
    return;
  }

  try {
    setLoading(true);
    setError("");

    // Construye el payload respetando campos opcionales
    const payload = {
      nombre: nt.nombre,
      categoria: nt.categoria,
      tipoLlave: nt.tipoLlave || "eliminacion_simple",
      fechaInicio: nt.fechaInicio || undefined,
      fechaFin: nt.fechaFin || undefined,
    };

    await apiPost(`${BASE_URL}/tournaments`, payload);

    // Cierra modal y limpia
    setNuevoTorneoOpen(false);
    setNt({ nombre: "", categoria: "Mayores", tipoLlave: "eliminacion_simple", fechaInicio: "", fechaFin: "" });

    // Refresca lista de torneos
    await reloadTournaments(true);

    // Aviso de éxito
    setToast({ open: true, title: "Torneo creado", message: "Torneo creado con éxito.", tone: "success" });
  } catch (e) {
    setToast({ open: true, title: "Error al crear torneo", message: String(e.message || e), tone: "error" });
  } finally {
    setLoading(false);
  }
}



  /* ---------------------------- helpers UI --------------------------- */
  function groupByRound(ms) {
    const by = new Map();
    for (const m of ms) {
      if (!by.has(m.ronda)) by.set(m.ronda, []);
      by.get(m.ronda).push(m);
    }
    const rounds = Array.from(by.keys()).sort((a, b) => a - b);
    return rounds.map((r) => ({
      ronda: r,
      items: by.get(r).sort((a, b) => (a.slot || 0) - (b.slot || 0)),
    }));
  }
  const rounds = useMemo(() => groupByRound(matches), [matches]);
  const selectedCategory = selectedTournament?.categoria || "";

  /* -------------------------------- render ------------------------------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header con input de API y botón NUEVO JUGADOR */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
         <img
          src={logoLiga}
          alt="Liga de Tenis de Mesa Meta"
          className="h-10 w-10 rounded-full object-contain"
          />
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

            {/* NUEVO: abre modal de “Crear jugador” */}
            <Button onClick={() => setNuevoJugadorOpen(true)} disabled={loading}>
              Nuevo jugador
            </Button>
            <Button onClick={() => setNuevoTorneoOpen(true)} disabled={loading}>
              Nuevo torneo
            </Button>

          </div>
        </div>
      </header>

      {/* Layout principal: sidebar (torneos) + contenido */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-4">
        {/* Sidebar: lista de torneos */}
        <aside className="col-span-12 md:col-span-3">
          <Card title="Torneos">
            <div className="flex flex-col gap-2">
              {tournaments.length === 0 && (
                <div className="text-sm text-gray-500">
                  No hay torneos. Crea uno por API.
                </div>
              )}
              {tournaments.map((t) => (
                <Button
                  key={t._id}
                  className={
                    "justify-start w-full " +
                    (selectedTournament?._id === t._id
                      ? "bg-gray-900 text-white"
                      : "bg-white")
                  }
                  onClick={() => loadTournamentData(t)}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{t.nombre}</span>
                    <span className="text-xs opacity-70">
                      {t.categoria} · {fmtDate(t.fechaInicio)}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
          </Card>
        </aside>

        {/* Contenido principal */}
        <section className="col-span-12 md:col-span-9 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button
              className={tab === "bracket" ? "bg-gray-900 text-white" : "bg-white"}
              onClick={() => setTab("bracket")}
            >
              Bracket
            </Button>
            <Button
              className={tab === "ranking" ? "bg-gray-900 text-white" : "bg-white"}
              onClick={() => setTab("ranking")}
            >
              Ranking
            </Button>
            <Button
              className={tab === "jugadores" ? "bg-gray-900 text-white" : "bg-white"}
              onClick={() => setTab("jugadores")}
            >
            Jugadores
           </Button>
           
            {selectedTournament && (
              <>
                <Badge>Categoria: {selectedCategory || "—"}</Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button onClick={handleGenerarLlaves} disabled={loading}>
                    Generar llaves
                  </Button>
                  <Button
                    className="text-red-600"
                    onClick={handleResetBracket}
                    disabled={loading}
                  >
                    Resetear bracket
                  </Button>
                </div>
              </>
            )}

            {loading && <span className="ml-2 text-sm">Cargando…</span>}
          </div>

          {/* Errores (texto plano para debug rápido) */}
          {error && (
            <Card>
              <div className="text-sm text-red-600 whitespace-pre-wrap">
                {String(error)}
              </div>
            </Card>
          )}

          {/* Mensaje si no hay torneo seleccionado */}
          {!selectedTournament && (
            <Card>
              <div className="text-sm text-gray-600">
                Selecciona un torneo en la izquierda para ver su cuadro y ranking.
              </div>
            </Card>
          )}

          {/* BRACKET */}
          {selectedTournament && tab === "bracket" && (
            <Card title={`Bracket — ${selectedTournament?.nombre || ""}`}>
              {rounds.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No hay partidos generados. Usa “Generar llaves”.
                </div>
              ) : (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))`,
                  }}
                >
                  {rounds.map((col) => (
                    <div key={col.ronda} className="flex flex-col gap-3">
                      <div className="text-sm font-semibold">Ronda {col.ronda}</div>
                      {col.items.map((m) => {
                        const nameA = m.jugadorA
                          ? nameById.get(String(m.jugadorA)) || m.jugadorA
                          : "BYE";
                        const nameB = m.jugadorB
                          ? nameById.get(String(m.jugadorB)) || m.jugadorB
                          : "BYE";
                        const isComplete = Boolean(m.jugadorA && m.jugadorB);
                        const isPlayed = m.estado === "jugado";
                        const ganador = m.ganadorId
                          ? nameById.get(String(m.ganadorId)) || m.ganadorId
                          : null;

                        return (
                          <div
                            key={m._id}
                            className={
                              "rounded-xl border p-3 bg-white " +
                              (isPlayed ? "opacity-90" : "")
                            }
                          >
                            <div className="text-xs text-gray-500 mb-1">
                              Slot {m.slot}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate">
                                <span className="font-medium">{nameA}</span>
                              </div>
                              <div className="text-sm">{m.marcador?.a ?? 0}</div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <div className="truncate">
                                <span className="font-medium">{nameB}</span>
                              </div>
                              <div className="text-sm">{m.marcador?.b ?? 0}</div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                             {ganador && (
                              <Badge>
                                Ganador: {ganador}
                                {(!m.jugadorA || !m.jugadorB) && " (BYE)"}
                              </Badge>
                            )}
                            {!isPlayed && isComplete && (
                              <Button
                                className="ml-auto"
                                onClick={() => openResultModal(m)}
                                disabled={loading}
                              >
                                Cargar resultado
                              </Button>
                            )}
                            {!isComplete && !ganador && (
                              <span className="text-xs text-gray-500 ml-auto">
                                Pendiente
                              </span>
                            )}

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

          {/* RANKING */}
          {selectedTournament && tab === "ranking" && (
            <Card title={`Ranking — ${selectedCategory || ""}`}>
              {ranking.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Sin registros para esta categoría.
                </div>
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
                          <td className="py-2 pr-4">
                            {r?.playerId?.nombre || r.playerId || "—"}
                          </td>
                          <td className="py-2 pr-4 font-semibold">{r.puntos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
   {/* PESTAÑA: JUGADORES */}
  {tab === "jugadores" && (
    <Card title="Jugadores">
      <div className="flex items-center gap-2 mb-3">
        <input
          className="border rounded-xl px-3 py-2 text-sm"
          placeholder="Buscar jugador por nombre…"
          value={playerQuery}
          onChange={(e) => setPlayerQuery(e.target.value)}
        />
        <Button onClick={reloadPlayers} disabled={loading}>Refrescar</Button>
        <Badge>{players.length} jugadores</Badge>

        {/*   botón que abre el modal de Inscribir */}
        <Button
          onClick={() => {
            if (!selectedTournament) {
              setToast({
                open: true,
                title: "Selecciona un torneo",
                message: "Elige un torneo en la izquierda para inscribir.",
                tone: "warn",
              });
            } else {
              setInscribirOpen(true);     // abre el modal
            }
          }}
          disabled={loading}
        >
          Inscribir en torneo
        </Button>
      </div>

      {filteredPlayers.length === 0 ? (
        <div className="text-sm text-gray-500">No se encontraron jugadores.</div>
      ) : (
        <ul className="text-sm max-h-64 overflow-auto divide-y">
         {filteredPlayers.map((p) => {
          const yaInscrito = inscritosIds.has(String(p._id));
          return (
            <li key={p._id} className="py-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>
                  {p.nombre}
                  {p.categoria ? (
                    <span className="text-gray-500"> · {p.categoria}</span>
                  ) : null}
                </span>
                {selectedTournament && yaInscrito && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Inscrito en {selectedTournament.nombre}
                  </span>
                )}
              </span>

              {p.documento && (
                <span className="text-xs text-gray-500">{p.documento}</span>
              )}
            </li>
          );
        })}

        </ul>
      )}
    </Card>
  )}
        </section>
      </main>

      

      {/* MODAL: Cargar resultado */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg">Cargar resultado</h3>
              <button className="text-gray-500" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            {modalMatch && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">
                  Ronda {modalMatch.ronda} · Slot {modalMatch.slot}
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <div className="text-sm mb-1 font-medium">A</div>
                   <input
                      type="number"
                      min={0}
                      max={4}
                      className="w-full border rounded-xl px-3 py-2 text-lg"
                      value={scoreA}
                      onChange={(e) => {
                        let v = parseInt(e.target.value, 10);
                        if (Number.isNaN(v)) v = 0;
                        if (v < 0) v = 0;
                        if (v > 4) v = 4;
                        setScoreA(v);
                    }}
                    />

                  <input
                    type="number"
                    min={0}
                    max={4}
                    className="w-full border rounded-xl px-3 py-2 text-lg"
                    value={scoreB}
                    onChange={(e) => {
                      let v = parseInt(e.target.value, 10);
                      if (Number.isNaN(v)) v = 0;
                      if (v < 0) v = 0;
                      if (v > 4) v = 4;
                      setScoreB(v);
                    }}
                  />

                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                  <Button className="bg-gray-900 text-white" onClick={submitResult}>
                    Guardar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: NUEVO JUGADOR  ← NUEVO */}
      {nuevoJugadorOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg">Nuevo jugador</h3>
              <button
                className="text-gray-500"
                onClick={() => {
                  setNuevoJugadorOpen(false);
                  // opcional: resetear al cancelar
                  // setNj({ nombre:"", documento:"", edad:"", categoria:"Mayores" });
                }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Nombre completo *"
                value={nj.nombre}
                onChange={(e) => setNj({ ...nj, nombre: e.target.value })}
              />
              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Documento"
                value={nj.documento}
                onChange={(e) => setNj({ ...nj, documento: e.target.value })}
              />
              <input
                type="number"
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Edad"
                value={nj.edad}
                onChange={(e) => setNj({ ...nj, edad: e.target.value })}
              />
              <select
                className="w-full border rounded-xl px-3 py-2"
                value={nj.categoria}
                onChange={(e) => setNj({ ...nj, categoria: e.target.value })}
              >
               <option>Master</option>
                <option>Mayores</option>
                <option>Sub-21</option>
                <option>Sub-19</option>
                <option>Sub-15</option>
                <option>Sub-13</option>
               
              </select>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button onClick={() => setNuevoJugadorOpen(false)}>Cancelar</Button>
                <Button
                  className="bg-gray-900 text-white"
                  onClick={crearJugador}
                  disabled={loading}
                >
                  Crear
                </Button>
              </div>
            </div>
          </div>
        </div>
        
      )}

      {/* MODAL: NUEVO TORNEO  --- */}

      {nuevoTorneoOpen && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg">Nuevo torneo</h3>
        <button
          className="text-gray-500"
          onClick={() => setNuevoTorneoOpen(false)}
        >
          ✕
        </button>
      </div>

      <div className="space-y-3">
        {/* Nombre */}
        <input
          className="w-full border rounded-xl px-3 py-2"
          placeholder="Nombre del torneo *"
          value={nt.nombre}
          onChange={(e) => setNt({ ...nt, nombre: e.target.value })}
        />

        {/* Categoría */}
        <select
          className="w-full border rounded-xl px-3 py-2"
          value={nt.categoria}
          onChange={(e) => setNt({ ...nt, categoria: e.target.value })}
        >
          <option>Libre</option>
          <option>Mayores</option>
          <option>Sub-19</option>
          {/* agrega más si manejas otras */}
        </select>

        {/* Tipo de llave (por ahora fija) */}
        <select
          className="w-full border rounded-xl px-3 py-2"
          value={nt.tipoLlave}
          onChange={(e) => setNt({ ...nt, tipoLlave: e.target.value })}
        >
          <option value="eliminacion_simple">Eliminación simple</option>
        </select>

        {/* Fechas (opcionales) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600">Fecha inicio</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={nt.fechaInicio}
              onChange={(e) => setNt({ ...nt, fechaInicio: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Fecha fin</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={nt.fechaFin}
              onChange={(e) => setNt({ ...nt, fechaFin: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={() => setNuevoTorneoOpen(false)}>Cancelar</Button>
          <Button className="bg-gray-900 text-white" onClick={crearTorneo} disabled={loading}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  </div>
)}
      {/* MODAL: INSCRIBIR JUGADOR EN TORNEO */}

{inscribirOpen && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg">
          Inscribir jugador {selectedTournament ? `— ${selectedTournament.nombre}` : ""}
        </h3>
        <button className="text-gray-500" onClick={() => setInscribirOpen(false)}>✕</button>
      </div>

      <div className="space-y-3">
        <select
        className="w-full border rounded-xl px-3 py-2"
        value={inscribirPlayerId}
        onChange={(e) => setInscribirPlayerId(e.target.value)}
      >
        <option value="">Selecciona un jugador…</option>
        {filteredPlayers.map((p) => {
          const yaInscrito = inscritosIds.has(String(p._id));
          return (
            <option
              key={p._id}
              value={p._id}
              disabled={yaInscrito}   // 👈 no deja seleccionarlo
            >
              {p.nombre}
              {yaInscrito ? " (ya inscrito)" : ""}
            </option>
          );
        })}
      </select>


        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={() => setInscribirOpen(false)}>Cancelar</Button>
          <Button
            className="bg-gray-900 text-white"
            onClick={inscribirJugador}
            disabled={loading || !inscribirPlayerId}
          >
            Inscribir
          </Button>
        </div>
      </div>
    </div>
  </div>
)}


 <InfoDialog
  open={toast.open}
  onClose={() => setToast({ ...toast, open: false })}
  title={toast.title}
  message={toast.message}
  tone={toast.tone}
/>

    </div>
  );
}
