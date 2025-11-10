// src/models/Ranking.js
const { Schema, model, Types } = require('mongoose');

/**
 * Esquema de Ranking:
 *  - Un documento por (playerId, categoria)
 *  - 'puntos' se usa para ordenar de mayor a menor
 */
const RankingSchema = new Schema(
  {
    playerId: {
      type: Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true
    },
    categoria: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    puntos: {
      type: Number,
      default: 0,
      min: [0, 'Los puntos no pueden ser negativos']
    }
  },
  { timestamps: true, collection: 'ranking' }
);

/** Índices útiles */
RankingSchema.index({ categoria: 1, puntos: -1, _id: 1 }, { name: 'cat_points_desc_id' });
RankingSchema.index(
  { playerId: 1, categoria: 1 },
  { unique: true, name: 'uniq_player_categoria' }
);

/** Limpieza básica antes de validar */
RankingSchema.pre('validate', function (next) {
  if (typeof this.categoria === 'string') {
    this.categoria = this.categoria.trim().replace(/\s+/g, ' ');
  }
  next();
});

/* -------------------- MÉTODOS ESTÁTICOS ÚTILES -------------------- */
/**
 * Devuelve la tabla de la categoría con posiciones (rank) usando $setWindowFields.
 * Requiere MongoDB >= 5 (tu stack usa 7, perfecto).
 * options: { limit=50, skip=0, proyectarJugador=true }
 */
RankingSchema.statics.table = async function (categoria, options = {}) {
  const { limit = 50, skip = 0, proyectarJugador = true } = options;

  const pipeline = [
    { $match: categoria ? { categoria } : {} },
    { $setWindowFields: {
        partitionBy: '$categoria',
        sortBy: { puntos: -1, _id: 1 },
        output: { posicion: { $rank: {} } }
      }
    },
    ...(proyectarJugador
      ? [{ $lookup: { from: 'jugadores', localField: 'playerId', foreignField: '_id', as: 'player' } },
         { $unwind: '$player' }]
      : []),
    { $sort: { puntos: -1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  return this.aggregate(pipeline);
};

/**
 * Top N de una categoría (con posición y datos del jugador).
 */
RankingSchema.statics.top = async function (categoria, n = 10) {
  return this.table(categoria, { limit: n, skip: 0, proyectarJugador: true });
};

/**
 * Posición (rank) y datos del jugador dentro de la categoría.
 * Retorna null si no existe.
 */
RankingSchema.statics.playerRank = async function (playerId, categoria) {
  if (!Types.ObjectId.isValid(playerId)) return null;

  const pipeline = [
    { $match: { categoria } },
    { $setWindowFields: {
        partitionBy: '$categoria',
        sortBy: { puntos: -1, _id: 1 },
        output: { posicion: { $rank: {} } }
      }
    },
    { $match: { playerId: new Types.ObjectId(playerId) } },
    { $lookup: { from: 'jugadores', localField: 'playerId', foreignField: '_id', as: 'player' } },
    { $unwind: { path: '$player', preserveNullAndEmptyArrays: true } },
    { $limit: 1 }
  ];

  const res = await this.aggregate(pipeline);
  return res[0] || null;
};

/**
 * Devuelve un “bloque” alrededor del jugador (por ejemplo ±3 posiciones).
 * Útil para mostrar contexto del rank.
 */
RankingSchema.statics.around = async function (playerId, categoria, radius = 3) {
  const center = await this.playerRank(playerId, categoria);
  if (!center) return { center: null, items: [] };

  const desde = Math.max(1, center.posicion - radius);
  const hasta = center.posicion + radius;

  // Obtenemos el rango de posiciones deseado con otro aggregate
  const pipeline = [
    { $match: { categoria } },
    { $setWindowFields: {
        partitionBy: '$categoria',
        sortBy: { puntos: -1, _id: 1 },
        output: { posicion: { $rank: {} } }
      }
    },
    { $match: { posicion: { $gte: desde, $lte: hasta } } },
    { $lookup: { from: 'jugadores', localField: 'playerId', foreignField: '_id', as: 'player' } },
    { $unwind: { path: '$player', preserveNullAndEmptyArrays: true } },
    { $sort: { posicion: 1 } }
  ];

  const items = await this.aggregate(pipeline);
  return { center, items };
};

/**
 * Suma (o resta) puntos al jugador en la categoría (upsert).
 * Retorna el documento actualizado.
 */
RankingSchema.statics.addPoints = async function (playerId, categoria, delta) {
  if (!Types.ObjectId.isValid(playerId)) {
    throw new Error('playerId inválido');
  }
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new Error('delta debe ser numérico');
  }

  const doc = await this.findOneAndUpdate(
    { playerId, categoria },
    { $inc: { puntos: delta }, $setOnInsert: { playerId, categoria } },
    { upsert: true, new: true }
  );

  // Evita negativos
  if (doc.puntos < 0) {
    doc.puntos = 0;
    await doc.save();
  }
  return doc;
};

/**
 * Setea puntos exactos (no incremental). Útil para correcciones.
 */
RankingSchema.statics.setPoints = async function (playerId, categoria, puntos) {
  if (!Types.ObjectId.isValid(playerId)) throw new Error('playerId inválido');
  if (typeof puntos !== 'number' || puntos < 0) throw new Error('puntos inválidos');

  const doc = await this.findOneAndUpdate(
    { playerId, categoria },
    { $set: { puntos }, $setOnInsert: { playerId, categoria } },
    { upsert: true, new: true }
  );
  return doc;
};

/**
 * Reinicia una categoría (borra los docs de esa categoría).
 */
RankingSchema.statics.resetCategory = async function (categoria) {
  const r = await this.deleteMany({ categoria });
  return { deleted: r.deletedCount || 0 };
};

module.exports = model('Ranking', RankingSchema);
