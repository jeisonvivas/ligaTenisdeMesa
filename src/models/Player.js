const { Schema, model } = require('mongoose');

const HistorialSchema = new Schema({
  fecha: { type: Date, default: Date.now },
  puntos: { type: Number, default: 0 },
  motivo: { type: String, default: '' }
}, { _id: false });

const PlayerSchema = new Schema({
  nombre: String,
  documento: { type: String, trim: true, unique: true }, // ← único
  edad: Number,
  categoria: String, // ej: "Mayores", "Sub-19"
  clubId: { type: Schema.Types.ObjectId, ref: 'Club' },
  rankingActual: { type: Number, default: 0 },
  historialRanking: { type: [HistorialSchema], default: [] }
}, { timestamps: true, collection: 'jugadores' }); // <- usa la colección existente

module.exports = model('Player', PlayerSchema);
