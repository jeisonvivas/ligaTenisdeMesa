require('dotenv').config();
const { connectDB } = require('./db');
const app = require('./app');

const PORT = process.env.PORT || 4000;

(async () => {
  await connectDB(process.env.MONGODB_URI);
  app.listen(PORT, () => {
    console.log(`🚀 API lista en http://localhost:${PORT}`);
  });
})();
