// server.js
const app = require('./app');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 3000;

pool.connect()
  .then(() => {
    console.log('Connected to PostgreSQL database');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error connecting to the database', err);
  });