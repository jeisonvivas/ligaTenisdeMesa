const express = require('express');
const router = express.Router();

// Rutas de prueba (puedes dejarlas)
router.get('/', (_req, res) => res.json({ ok: true, msg: 'API viva' }));

module.exports = router;     // <-- exporta EL ROUTER, no { router }
