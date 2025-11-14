// src/models/Match.js
const { Schema, model } = require('mongoose');

const ScoreSchema = new Schema(
  {
    a: { type: Number, default: 0, min: [0, 'Marcador A no puede ser negativo'] },
    b: { type: Number, default: 0, min: [0, 'Marcador B no puede ser negativo'] }
  },
  { _id: false }
);

const MatchSchema = new Schema(
  {
    torneoId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    categoria: { type: String, required: true, index: true },

    ronda: {
      type: Number,
      required: true,
      min: [1, 'La ronda debe ser >= 1'],
      validate: {
        validator: Number.isInteger,
        message: 'La ronda debe ser un número entero'
      }
    },

    slot: {
      type: Number,
      required: true,
      min: [1, 'El slot debe ser >= 1'],
      validate: {
        validator: Number.isInteger,
        message: 'El slot debe ser un número entero'
      },
      index: true
    },

    jugadorA: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    jugadorB: { type: Schema.Types.ObjectId, ref: 'Player', default: null },

    marcador: { type: ScoreSchema, default: () => ({ a: 0, b: 0 }) },

    ganadorId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },

    estado: { type: String, enum: ['pendiente', 'jugado'], default: 'pendiente', index: true }
  },
  {
    timestamps: true,
    collection: 'partidos'
  }
);

/**
 * Índice único para no duplicar partidos de la misma llave:
 * (mismo torneo + categoría + ronda + slot)
 */
MatchSchema.index(
  { torneoId: 1, categoria: 1, ronda: 1, slot: 1 },
  { unique: true, name: 'uniq_match_key' }
);

/**
 * Validaciones de consistencia:
 * - jugadorA y jugadorB no pueden ser iguales
 * - Si estado='jugado': ambos jugadores deben existir
 *   y ganadorId debe ser uno de ellos
 * - Si estado='jugado': no puede haber empate (a != b)
 */
MatchSchema.pre('validate', function (next) {
  // A y B distintos (si ambos existen)
  if (this.jugadorA && this.jugadorB && String(this.jugadorA) === String(this.jugadorB)) {
    return next(new Error('jugadorA y jugadorB no pueden ser el mismo jugador'));
  }

  // Marcadores enteros
  const isInt = (n) => Number.isInteger(n);
  if (!isInt(this.marcador?.a) || !isInt(this.marcador?.b)) {
    return next(new Error('Los marcadores deben ser números enteros'));
  }

  // Reglas cuando el partido está marcado como jugado
  if (this.estado === 'jugado') {
  const faltaAlgunJugador = !this.jugadorA || !this.jugadorB;

  // 🔹 Caso especial: victoria por BYE / WO
  if (faltaAlgunJugador) {
    if (!this.ganadorId) {
      return next(new Error('Debe establecerse ganadorId cuando el partido está jugado'));
    }

    // El ganador debe ser el único jugador presente
    const idPresente = this.jugadorA || this.jugadorB;
    if (String(this.ganadorId) !== String(idPresente)) {
      return next(new Error('En un BYE el ganador debe ser el único jugador presente'));
    }

    // No validamos marcador ni nada más para este caso
    return next();
  }

  // 🔹 Partidos normales (dos jugadores)
  if (this.marcador.a === this.marcador.b) {
    return next(new Error('No puede haber empate en un partido jugado'));
  }

  if (!this.ganadorId) {
    return next(new Error('Debe establecerse ganadorId cuando el partido está jugado'));
  }

  const ganadorEsAOB =
    String(this.ganadorId) === String(this.jugadorA) ||
    String(this.ganadorId) === String(this.jugadorB);

  if (!ganadorEsAOB) {
    return next(new Error('ganadorId debe ser jugadorA o jugadorB'));
  }
}


  next();
});

/**
 * Pequeña ayuda: saber si el match está listo para jugar (tiene A y B)
 */
MatchSchema.virtual('completo').get(function () {
  return Boolean(this.jugadorA && this.jugadorB);
});

module.exports = model('Match', MatchSchema);
