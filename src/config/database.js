const mysql = require('mysql2/promise');

let dbConfig;

if (process.env.DATABASE_URL) {
  // Railway database URL format
  // mysql://user:password@host:port/database
  const url = new URL(process.env.DATABASE_URL);
  
  dbConfig = {
    host: url.hostname,
    port: url.port || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1), // Remove leading '/'
    ssl: {
      rejectUnauthorized: false
    },
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  };
} else {
  // Local development
  dbConfig = {
    host: process.env.DATABASE_HOST || 'sql12.freesqldatabase.com',
    port: process.env.DATABASE_PORT || 3306,
    user: process.env.DATABASE_USER || 'sql12785091',
    password: process.env.DATABASE_PASSWORD || 'f616rtqLdU',
    database: process.env.DATABASE_NAME || 'sql12785091',
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