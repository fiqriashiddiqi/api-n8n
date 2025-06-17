const mysql = require('mysql2/promise');

let dbConfig;

// Railway MySQL environment variables dari screenshot
const railwayMysqlConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER || process.env.MYSQLUSER,
  password: process.env.MYSQL_ROOT_PASSWORD || process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
  port: parseInt(process.env.MYSQL_PORT || process.env.MYSQLPORT || '3306')
};

// Check multiple possible Railway environment variable patterns
const databaseUrl = process.env.DATABASE_URL || 
                   process.env.MYSQL_URL || 
                   process.env.MYSQL_PUBLIC_URL ||
                   process.env.MYSQL_PRIVATE_URL;

console.log('🔍 Railway MySQL Environment Check:', {
  DATABASE_URL: !!process.env.DATABASE_URL,
  MYSQL_URL: !!process.env.MYSQL_URL,
  MYSQL_HOST: !!process.env.MYSQL_HOST,
  MYSQL_USER: !!process.env.MYSQL_USER,
  MYSQL_ROOT_PASSWORD: !!process.env.MYSQL_ROOT_PASSWORD,
  MYSQL_DATABASE: !!process.env.MYSQL_DATABASE,
  MYSQL_PORT: !!process.env.MYSQL_PORT,
  MYSQL_PUBLIC_URL: !!process.env.MYSQL_PUBLIC_URL,
  MYSQL_PRIVATE_URL: !!process.env.MYSQL_PRIVATE_URL,
  RAILWAY_PRIVATE_DOMAIN: !!process.env.RAILWAY_PRIVATE_DOMAIN
});

// Debug actual values (first 50 chars only)
console.log('🔧 Debug actual values:', {
  DATABASE_URL_preview: process.env.DATABASE_URL ? 
    process.env.DATABASE_URL.substring(0, 50) + '...' : 'Not set',
  MYSQL_URL_preview: process.env.MYSQL_URL ? 
    process.env.MYSQL_URL.substring(0, 50) + '...' : 'Not set',
  MYSQL_HOST_preview: process.env.MYSQL_HOST || 'Not set',
  RAILWAY_PRIVATE_DOMAIN_preview: process.env.RAILWAY_PRIVATE_DOMAIN || 'Not set'
});

if (databaseUrl) {
  // Method 1: Use DATABASE_URL/MYSQL_URL format
  try {
    const url = new URL(databaseUrl);
    
    dbConfig = {
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading '/'
      port: parseInt(url.port) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 30000, // Only valid timeout option
      ssl: false
    };
    
    console.log('🚂 Using Railway MySQL (URL format)');
    console.log('🔗 Connection details:', {
      host: url.hostname,
      port: url.port,
      database: url.pathname.slice(1),
      user: url.username
    });
  } catch (error) {
    console.error('❌ Invalid DATABASE_URL format:', error.message);
    dbConfig = getFallbackConfig();
  }
} else if (railwayMysqlConfig.host && railwayMysqlConfig.user) {
  // Method 2: Use individual Railway MySQL environment variables
  dbConfig = {
    host: railwayMysqlConfig.host,
    user: railwayMysqlConfig.user,
    password: railwayMysqlConfig.password,
    database: railwayMysqlConfig.database,
    port: railwayMysqlConfig.port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000,
    ssl: false
  };
  
  console.log('🚂 Using Railway MySQL (individual vars)');
} else {
  // Method 3: Fallback configuration
  console.log('⚠️ No Railway MySQL variables found, using fallback');
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
    connectTimeout: 30000,
    ssl: false
  };
}

console.log('🗄️ Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  source: databaseUrl ? 'Railway MySQL (URL)' : 
          (railwayMysqlConfig.host ? 'Railway MySQL (Vars)' : 'Fallback Config')
});

let pool;
let isConnected = false;

// Create database pool
async function createPool() {
  try {
    console.log('🔄 Creating MySQL connection pool...');
    
    pool = mysql.createPool(dbConfig);
    
    // Test connection immediately with simple query
    const connection = await pool.getConnection();
    
    // Use simple test query (fix SQL syntax)
    await connection.execute('SELECT 1 as test, NOW() as current_time');
    console.log('✅ Database connection test successful');
    
    // Test database info with proper MySQL syntax
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
    // Use proper MySQL syntax
    const [result] = await connection.execute('SELECT 1 as test, NOW() as time_now');
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
    
    // Use proper MySQL syntax
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