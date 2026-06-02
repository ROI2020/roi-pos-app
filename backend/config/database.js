// Pool de conexiones para PostgreSQL usando pg
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // Busca el .env en la raíz

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Ej: postgres://user:pass@host:port/db
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = pool;
