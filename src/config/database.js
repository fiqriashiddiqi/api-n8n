const mysql = require('mysql2/promise');

let dbConfig;

// Check multiple possible environment variable names used by Railway
const databaseUrl = process.env.DATABASE_URL || 
                   process.env.MYSQL_URL || 
                   process.env.MYSQL_PRIVATE_URL ||
                   process.env.MYSQL_PUBLIC_URL;

console.log('🔍 Environment variables check:', {
  DATABASE_URL: !!process.env.DATABASE_URL,
  MYSQL_URL: !!process.env.MYSQL_URL,
  MYSQL_PRIVATE_URL: !!process.env.MYSQL_PRIVATE_URL,
  MYSQL_PUBLIC_URL: !!process.env.MYSQL_PUBLIC_URL,
  selected_url: databaseUrl ? 'Found' : 'None'
});

if (databaseUrl) {
  // Railway MySQL - DATABASE_URL format: mysql://user:password@host:port/database
  try {
    const url = new URL(databaseUrl);
    
    dbConfig = {
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading '/'
      port: parseInt(url.port) || 3306,
      // Railway MySQL optimized settings
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 20000,
      ssl: false // Railway internal network
    };
    
    console.log('🚂 Using Railway MySQL database');
  } catch (error) {
    console.error('❌ Invalid DATABASE_URL format:', error.message);
    console.log('🔄 Falling back to local configuration...');
    dbConfig = getFallbackConfig();
  }
} else {
  // Local development fallback
  console.log('⚠️ No Railway database URL found, using fallback config');
  dbConfig = getFallbackConfig();
}

function getFallbackConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'user_api',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: false
  };
}

console.log('🗄️ Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  source: databaseUrl ? 'Railway MySQL' : 'Fallback Config'
});

let pool;
let isConnected = false;

// Create database pool
async function createPool() {
  try {
    console.log('🔄 Creating MySQL connection pool...');
    
    pool = mysql.createPool(dbConfig);
    
    // Test connection immediately
    const connection = await pool.getConnection();
    
    // Test basic query
    await connection.execute('SELECT 1 as test, NOW() as current_time');
    console.log('✅ Database connection test successful');
    
    // Test database info
    const [dbInfo] = await connection.execute('SELECT DATABASE() as db_name, VERSION() as mysql_version');
    console.log('📊 Database info:', dbInfo[0]);
    
    connection.release();
    
    isConnected = true;
    console.log('✅ MySQL pool created successfully');
    
    return pool;
  } catch (error) {
    console.error('❌ Database pool creation failed:', error.message);
    console.error('Error details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState
    });
    
    isConnected = false;
    throw error;
  }
}

// Test connection function
async function testConnection() {
  try {
    if (!pool) {
      console.log('🔄 Pool not initialized, creating...');
      await createPool();
    }
    
    if (!pool) {
      throw new Error('Failed to create database pool');
    }
    
    const connection = await pool.getConnection();
    const [result] = await connection.execute('SELECT 1 as test, NOW() as current_time');
    connection.release();
    
    console.log('✅ Database connection test successful:', result[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    isConnected = false;
    return false;
  }
}

// Get database info
async function getDatabaseInfo() {
  try {
    if (!pool) {
      await createPool();
    }
    
    const connection = await pool.getConnection();
    
    const [dbInfo] = await connection.execute(`
      SELECT 
        DATABASE() as database_name,
        VERSION() as mysql_version,
        USER() as current_user,
        CONNECTION_ID() as connection_id
    `);
    
    const [tables] = await connection.execute('SHOW TABLES');
    
    connection.release();
    
    return {
      info: dbInfo[0],
      tables: tables.map(t => Object.values(t)[0]),
      tables_count: tables.length
    };
  } catch (error) {
    console.error('❌ Failed to get database info:', error.message);
    return null;
  }
}

// Initialize pool on module load
createPool().catch(err => {
  console.error('❌ Failed to initialize database pool on startup:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Closing database connections...');
  if (pool) {
    await pool.end();
    console.log('✅ Database connections closed');
  }
});

// Database exports with Railway MySQL compatibility
const dbExports = {
  execute: async (query, params) => {
    if (!pool) {
      await createPool();
    }
    return pool.execute(query, params);
  },
  getConnection: async () => {
    if (!pool) {
      await createPool();
    }
    return pool.getConnection();
  }
};

// Export everything
module.exports = dbExports;
module.exports.pool = dbExports; // For compatibility with existing code
module.exports.testConnection = testConnection;
module.exports.getDatabaseInfo = getDatabaseInfo;
module.exports.isConnected = () => isConnected;