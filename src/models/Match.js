// src/models/Match.js
const { Schema, model } = require('mongoose');

const MatchSchema = new Schema({
  torneoId: { type: Schema.Types.ObjectId, ref: 'Tournament', index: true },
  categoria: { type: String, index: true },
  ronda: { type: Number, index: true },
  slot: { type: Number, index: true },

  jugadorA: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
  jugadorB: { type: Schema.Types.ObjectId, ref: 'Player', default: null },

  marcador: {
    a: { type: Number, default: 0 },
    b: { type: Number, default: 0 }
  },

  ganadorId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
  estado: { type: String, enum: ['pendiente', 'jugado'], default: 'pendiente' }
}, {
  timestamps: true,
  collection: 'partidos' // <- usa tu colección existente en Mongo
});

// Exporta *el modelo*, no un objeto con el modelo
module.exports = model('Match', MatchSchema);
