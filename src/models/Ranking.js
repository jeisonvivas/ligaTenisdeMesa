const { Schema, model } = require('mongoose');

const RankingSchema = new Schema({
  playerId: { type: Schema.Types.ObjectId, ref: 'Player', index: true },
  categoria: { type: String, index: true },
  puntos: { type: Number, default: 0 }
}, { timestamps: true });

RankingSchema.index({ categoria: 1, puntos: -1 });

module.exports = model('Ranking', RankingSchema);
