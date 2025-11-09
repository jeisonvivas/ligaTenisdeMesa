const express = require('express');
const cors = require('cors');
const routes = require('./routes');  // NO uses ./routes/index.js; así está bien

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/', routes);                // aquí montamos el router

module.exports = app;
