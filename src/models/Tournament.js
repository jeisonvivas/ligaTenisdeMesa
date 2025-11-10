const { Schema, model } = require('mongoose');

const TorneoSchema = new Schema({
  nombre: String,
  categoria: String, // "Mayores" | "Sub-19" ...
  tipoLlave: { type: String, default: 'eliminacion_simple' },
  fechaInicio: Date,
  fechaFin: Date,
  jugadoresInscritos: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
  estado: { type: String, enum: ['creado','en_juego','finalizado'], default: 'creado' },
  ganador: { type: Schema.Types.Mixed, default: null }
}, { timestamps: true, collection: 'torneos' }); // <-- importante

module.exports = model('Tournament', TorneoSchema);
