// src/models/Tournament.js
const { Schema, model, Types } = require('mongoose');

const CATEGORIAS_PERMITIDAS = [
  'Mayores',
  'Sub-21',
  'Sub-19',
  'Sub-15',
  'Sub-13',
  'Libre'
];

const TIPOS_LLAVE = [
  'eliminacion_simple',   // single elim
  'doble_eliminacion',    // double elim (opcional futuro)
  'grupos'                // round-robin (opcional futuro)
];

const TorneoSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del torneo es obligatorio'],
      trim: true,
      minlength: [3, 'El nombre debe tener al menos 3 caracteres'],
      maxlength: [120, 'El nombre no debe superar 120 caracteres']
    },

    categoria: {
      type: String,
      required: [true, 'La categoría es obligatoria'],
      trim: true,
      // Si quieres permitir cualquier texto, quita "enum" y deja solo required/trim.
      enum: {
        values: CATEGORIAS_PERMITIDAS,
        message: 'Categoría inválida'
      }
    },

    tipoLlave: {
      type: String,
      default: 'eliminacion_simple',
      enum: {
        values: TIPOS_LLAVE,
        message: 'Tipo de llave inválido'
      }
    },

    fechaInicio: {
      type: Date,
      // no required para no romper flujos actuales; valida coherencia más abajo
    },

    fechaFin: {
      type: Date,
      // se valida contra fechaInicio en pre-validate
    },

    jugadoresInscritos: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
      default: []
    },

    estado: {
      type: String,
      enum: ['creado', 'en_juego', 'finalizado'],
      default: 'creado',
      index: true
    },

    // Puedes mantenerlo flexible. Si quieres estructura, cambia por un sub-esquema.
    ganador: {
      type: Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'torneos'
  }
);

/**
 * Índices útiles:
 * - Búsquedas por categoría y fecha
 * - Evitar torneos duplicados (mismo nombre + categoría + fechaInicio)
 */
TorneoSchema.index({ categoria: 1, fechaInicio: 1 });
TorneoSchema.index(
  { nombre: 1, categoria: 1, fechaInicio: 1 },
  { unique: true, sparse: true, name: 'uniq_nombre_categoria_fecha' }
);

/**
 * Validaciones de coherencia y limpieza antes de validar/guardar
 */
TorneoSchema.pre('validate', function (next) {
  // Trim fuerte al nombre
  if (typeof this.nombre === 'string') {
    this.nombre = this.nombre.trim().replace(/\s+/g, ' ');
  }

  // Validar fechas (si ambas existen)
  if (this.fechaInicio && this.fechaFin && this.fechaFin < this.fechaInicio) {
    return next(new Error('La fecha de fin no puede ser anterior a la fecha de inicio'));
  }

  // jugadoresInscritos: todos deben ser ObjectId válidos
  if (Array.isArray(this.jugadoresInscritos)) {
    for (const id of this.jugadoresInscritos) {
      if (!Types.ObjectId.isValid(id)) {
        return next(new Error('Se encontró un playerId inválido en jugadoresInscritos'));
      }
    }
    // Sin duplicados
    const uniques = new Set(this.jugadoresInscritos.map(String));
    if (uniques.size !== this.jugadoresInscritos.length) {
      return next(new Error('Hay jugadores duplicados en jugadoresInscritos'));
    }
  }

  next();
});

/**
 * Helper: cantidad de inscritos
 */
TorneoSchema.virtual('inscritosCount').get(function () {
  return Array.isArray(this.jugadoresInscritos) ? this.jugadoresInscritos.length : 0;
});

module.exports = model('Tournament', TorneoSchema);
