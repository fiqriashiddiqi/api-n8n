const mysql = require('mysql2/promise');

let dbConfig;

if (process.env.DATABASE_URL) {
  // Railway database URL format
  // mysql://user:password@host:port/database
  const url = new URL(process.env.DATABASE_URL);
  
  dbConfig = {
    host: 'sql12.freesqldatabase.com',
    user: 'sql12785091',
    password: 'f616rtqLdU',
    database: 'sql12785091',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};
} else {
  // Local development
  dbConfig = {
    host: process.env.DB_HOST || 'sql12.freesqldatabase.com',
    user: process.env.DB_USER || 'sql12785091',
    password: process.env.DB_PASSWORD || 'f616rtqLdU',
    database: process.env.DB_NAME || 'sql12785091',
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10
  };
}

console.log('🗄️ Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  ssl: !!dbConfig.ssl
});

const pool = mysql.createPool(dbConfig);

// Test connection
pool.execute('SELECT 1')
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

module.exports = pool;