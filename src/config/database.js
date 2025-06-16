const mysql = require('mysql2/promise');

let dbConfig;

if (process.env.DATABASE_URL) {
  // Jika menggunakan Railway MySQL plugin
  const url = new URL(process.env.DATABASE_URL);
  
  dbConfig = {
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    port: url.port || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  };
} else {
  // FreeSQLDatabase atau local development
  dbConfig = {
    host: process.env.DB_HOST || 'sql12.freesqldatabase.com',
    user: process.env.DB_USER || 'sql12785091',
    password: process.env.DB_PASSWORD || 'f616rtqLdU',
    database: process.env.DB_NAME || 'sql12785091',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 5, // Reduced for free tier
    queueLimit: 0,
    acquireTimeout: 30000,
    timeout: 30000,
    reconnect: true,
    // Try without SSL first for freesqldatabase
    ssl: false
  };
}

console.log('🗄️ Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  ssl: !!dbConfig.ssl
});

let pool;
let retryCount = 0;
const maxRetries = 3;

async function createPool() {
  try {
    pool = mysql.createPool(dbConfig);
    
    // Test connection immediately
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1 as test');
    connection.release();
    
    console.log('✅ Database pool created and tested successfully');
    return pool;
  } catch (error) {
    console.error('❌ Database pool creation failed:', error.message);
    
    // Retry with different settings if first attempt fails
    if (retryCount < maxRetries) {
      retryCount++;
      console.log(`🔄 Retrying database connection (${retryCount}/${maxRetries})...`);
      
      // Try with SSL if first attempt failed
      if (!dbConfig.ssl && retryCount === 1) {
        console.log('🔄 Trying with SSL enabled...');
        dbConfig.ssl = { rejectUnauthorized: false };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      return createPool();
    }
    
    throw error;
  }
}

// Initialize pool
createPool().catch(err => {
  console.error('❌ Failed to initialize database pool:', err.message);
});

// Test connection function
async function testConnection() {
  try {
    if (!pool) {
      await createPool();
    }
    
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1 as test, NOW() as current_time');
    connection.release();
    
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;