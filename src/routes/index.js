// src/routes/index.js
const express = require('express');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Ranking = require('../models/Ranking');

const router = express.Router();

// -------------------- Salud --------------------
router.get('/', (_req, res) => res.json({ ok: true, msg: 'API viva' }));
router.get('/health', (_req, res) => res.json({ ok: true }));

// -------------------- Jugadores --------------------
router.post('/players', async (req, res) => {
  try {
    const player = await Player.create(req.body);
    return res.json(player);
  } catch (e) {
    // Si el índice único dispara, Mongo/Mongoose dan code 11000 (duplicate key)
    if (e && e.code === 11000) {
      return res.status(409).json({ error: 'Este jugador ya existe', code: 'DUPLICATE' });
    }
    return res.status(400).json({ error: e.message });
  }
});

router.get('/players', async (_req, res) => {
  const players = await Player.find().sort({ nombre: 1 });
  res.json(players);
});


// -------------------- Torneos --------------------
router.post('/tournaments', async (req, res) => {
  try {
    const { nombre, categoria, tipoLlave, fechaInicio, fechaFin } = req.body;
    const t = await Tournament.create({
      nombre,
      categoria,
      tipoLlave: tipoLlave || 'eliminacion_simple',
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      estado: 'creado',
      jugadoresInscritos: []
    });
    res.json(t);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Inscribir jugador (ObjectId en jugadoresInscritos)
router.post('/tournaments/:id/inscribir', async (req, res) => {
  try {
    const { id } = req.params;
    const { playerId } = req.body;

    const t = await Tournament.findById(id);
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const yaEsta = t.jugadoresInscritos.some(j => String(j) === String(playerId));
    if (yaEsta) return res.status(400).json({ error: 'Jugador ya inscrito' });

    t.jugadoresInscritos.push(playerId);
    await t.save();

    res.json({ ok: true, jugadoresInscritos: t.jugadoresInscritos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------- Generar llaves (single elim) --------------------
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

router.post('/tournaments/:id/generar-llaves', async (req, res) => {
  try {
    const { id } = req.params;

    const t = await Tournament.findById(id).populate('jugadoresInscritos');
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const categoria = t.categoria;
    const inscritos = t.jugadoresInscritos;

    // 👇 nuevo
    await Match.deleteMany({ torneoId: t._id, categoria });
    t.estado = 'creado';
    t.ganador = null;
    await t.save();

    if (inscritos.length < 2) {
      return res.status(400).json({ error: 'Se necesitan al menos 2 jugadores' });
    }


    // Siembra: rankingActual desc, luego nombre asc
    inscritos.sort((a, b) =>
      (b.rankingActual || 0) - (a.rankingActual || 0) ||
      (a.nombre || '').localeCompare(b.nombre || '')
    );

    const total = inscritos.length;
    const size = nextPow2(total);
    const byes = size - total;

    // Lista con BYEs al final (null)
    const lista = inscritos.map(p => p._id);
    for (let i = 0; i < byes; i++) lista.push(null);

    // Emparejar 1vsN, 2vsN-1, ...
    const pairs = [];
    for (let i = 0; i < size / 2; i++) pairs.push([lista[i], lista[size - 1 - i]]);

    // Crear partidos de Ronda 1
    for (let i = 0; i < pairs.length; i++) {
      const [A, B] = pairs[i];
      await Match.create({
        torneoId: t._id, categoria, ronda: 1, slot: i + 1, jugadorA: A, jugadorB: B
      });
    }

    // Pre-crear rondas siguientes vacías
    let round = 2, matchesInRound = size / 4;
    while (matchesInRound >= 1) {
      for (let s = 1; s <= matchesInRound; s++) {
        await Match.create({ torneoId: t._id, categoria, ronda: round, slot: s });
      }
      round++; matchesInRound = Math.floor(matchesInRound / 2);
    }

    // Avance automático por BYE (sin sumar puntos)
    const byeMatches = await Match.find({ torneoId: t._id, categoria, ronda: 1 });
    for (const m of byeMatches) {
      if (m.jugadorA && !m.jugadorB) await avanzarGanador(m, m.jugadorA, { awardPoints: false });
      else if (!m.jugadorA && m.jugadorB) await avanzarGanador(m, m.jugadorB, { awardPoints: false });
    }

    t.estado = 'en_juego';
    await t.save();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------- Resultado y propagación --------------------
// awardPoints=true por defecto; en BYE se manda false
async function avanzarGanador(match, ganadorId, opts = { awardPoints: true }) {
  match.ganadorId = ganadorId;
  match.estado = 'jugado';
  await match.save();

  if (opts.awardPoints) {
    // 1) Ranking global (+100)
    let r = await Ranking.findOne({ playerId: ganadorId, categoria: match.categoria });
    if (!r) r = await Ranking.create({ playerId: ganadorId, categoria: match.categoria, puntos: 0 });
    r.puntos += 100;
    await r.save();

    // 2) Sincronizar con "jugadores": rankingActual + historialRanking
    const player = await Player.findById(ganadorId);
    if (player) {
      player.rankingActual = (player.rankingActual || 0) + 100;
      player.historialRanking = player.historialRanking || [];
      player.historialRanking.push({
        fecha: new Date(),
        puntos: 100,
        motivo: `Victoria en ${match.categoria} (ronda ${match.ronda})`
      });
      await player.save();
    }
  }

  // Propagar a la siguiente ronda
  const destino = await Match.findOne({
    torneoId: match.torneoId,
    categoria: match.categoria,
    ronda: match.ronda + 1,
    slot: Math.ceil(match.slot / 2)
  });
  if (destino) {
    if (match.slot % 2 === 1) destino.jugadorA = ganadorId;
    else destino.jugadorB = ganadorId;
    await destino.save();
  } else {
    // Si no hay destino, era la final: guardar ganador en el torneo
    await Tournament.findByIdAndUpdate(match.torneoId, {
      estado: 'finalizado',
      ganador: { playerId: ganadorId, categoria: match.categoria, fecha: new Date() }
    });
  }
}

router.post('/matches/:id/resultado', async (req, res) => {
  try {
    const { id } = req.params;
    const { a, b } = req.body; // marcador
    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (!match.jugadorA || !match.jugadorB) return res.status(400).json({ error: 'Partido incompleto' });

    match.marcador = { a, b };
    const ganadorId = a > b ? match.jugadorA : match.jugadorB;
    await avanzarGanador(match, ganadorId, { awardPoints: true });

    res.json({ ok: true, ganadorId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------- Consultas --------------------
router.get('/tournaments/:id/bracket', async (req, res) => {
  const { id } = req.params;
  const matches = await Match.find({ torneoId: id }).sort({ ronda: 1, slot: 1 }).lean();
  res.json(matches);
});

router.get('/ranking', async (req, res) => {
  const { categoria } = req.query;
  const q = categoria ? { categoria } : {};
  const tabla = await Ranking.find(q).populate('playerId').sort({ puntos: -1 }).lean();
  res.json(tabla);
});

// Listar torneos
router.get('/tournaments', async (_req, res) => {
  const ts = await Tournament.find().sort({ createdAt: -1 }).lean();
  res.json(ts);
});

// Detalle de un torneo (con jugadores inscritos)
router.get('/tournaments/:id', async (req, res) => {
  const t = await Tournament.findById(req.params.id).populate('jugadoresInscritos').lean();
  if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
  res.json(t);
});


//  resetear el bracket de un torneo
router.delete('/tournaments/:id/bracket', async (req, res) => {
  try {
    const { id } = req.params;

    const t = await Tournament.findById(id);
    if (!t) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    // Borrar todos los partidos del torneo
    await Match.deleteMany({ torneoId: t._id });

    // Opcional: resetear estado y ganador
    t.estado = 'creado';
    t.ganador = null;
    await t.save();

    return res.json({ ok: true, msg: 'Bracket reseteado correctamente' });
  } catch (error) {
    console.error('Error al resetear bracket:', error);
    return res.status(500).json({ error: 'Error interno al resetear bracket' });
  }
});



module.exports = router;
