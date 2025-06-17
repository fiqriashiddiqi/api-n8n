// src/config/database.js
const mysql = require('mysql2/promise');
const url = require('url');

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

console.log('🔧 Debug actual values:', {
  DATABASE_URL_preview: process.env.DATABASE_URL ? 
    process.env.DATABASE_URL.substring(0, 50) + '...' : 'Not set',
  MYSQL_URL_preview: process.env.MYSQL_URL ? 
    process.env.MYSQL_URL.substring(0, 50) + '...' : 'Not set',
  MYSQL_HOST_preview: process.env.MYSQL_HOST || 'Not set',
  RAILWAY_PRIVATE_DOMAIN_preview: process.env.RAILWAY_PRIVATE_DOMAIN || 'Not set'
});

let dbConfig;

if (process.env.DATABASE_URL) {
  console.log('🚂 Using Railway MySQL (URL format)');
  try {
    const parsedUrl = url.parse(process.env.DATABASE_URL);
    
    dbConfig = {
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port) || 3306,
      user: parsedUrl.auth.split(':')[0],
      password: parsedUrl.auth.split(':')[1],
      database: parsedUrl.pathname.slice(1),
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      charset: 'utf8mb4',
      ssl: {
        rejectUnauthorized: false
      }
    };
    
    console.log('🔗 Connection details:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user
    });
    
  } catch (error) {
    console.error('❌ Failed to parse DATABASE_URL:', error.message);
    throw error;
  }
  
} else if (process.env.MYSQL_URL) {
  console.log('🚂 Using Railway MySQL (MYSQL_URL)');
  try {
    const parsedUrl = url.parse(process.env.MYSQL_URL);
    
    dbConfig = {
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port) || 3306,
      user: parsedUrl.auth.split(':')[0],
      password: parsedUrl.auth.split(':')[1],
      database: parsedUrl.pathname.slice(1),
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      charset: 'utf8mb4',
      ssl: {
        rejectUnauthorized: false
      }
    };
    
  } catch (error) {
    console.error('❌ Failed to parse MYSQL_URL:', error.message);
    throw error;
  }
  
} else if (process.env.MYSQL_HOST) {
  console.log('🚂 Using Railway MySQL (individual vars)');
  dbConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'railway',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    charset: 'utf8mb4',
    ssl: {
      rejectUnauthorized: false
    }
  };
  
} else {
  console.log('⚠️ No Railway MySQL detected, using fallback config');
  dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'test',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    charset: 'utf8mb4'
  };
}

console.log('🗄️ Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  source: process.env.DATABASE_URL ? 'Railway MySQL (URL)' : 
          process.env.MYSQL_URL ? 'Railway MySQL (MYSQL_URL)' :
          process.env.MYSQL_HOST ? 'Railway MySQL (individual vars)' : 'Fallback'
});

let pool;

async function createPool() {
  try {
    console.log('🔄 Creating MySQL connection pool...');
    
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: false,
      namedPlaceholders: false
    });

    // Test connection without problematic SQL functions
    console.log('🔍 Testing database connection...');
    const connection = await pool.getConnection();
    
    try {
      // Simple test query that works on all MySQL versions
      const [result] = await connection.execute('SELECT 1 as test, NOW() as time_now');
      console.log('✅ Database connection test successful:', result[0]);
      
      // Test database info with safe queries
      try {
        const [dbResult] = await connection.execute('SELECT DATABASE() as current_db');
        const [versionResult] = await connection.execute('SELECT VERSION() as version');
        console.log('🗄️ Database info:', {
          database: dbResult[0].current_db,
          version: versionResult[0].version
        });
      } catch (infoError) {
        console.log('⚠️ Could not get database info:', infoError.message);
      }
      
    } finally {
      connection.release();
    }
    
    console.log('🗄️ Database: Railway MySQL Connected ✅');
    return pool;
    
  } catch (error) {
    console.error('❌ Database pool creation failed:', error.message);
    console.error('Error details:', { 
      code: error.code, 
      errno: error.errno, 
      sqlState: error.sqlState 
    });
    
    // Create a mock pool for development
    return {
      execute: async () => { 
        throw new Error('Database connection failed: ' + error.message); 
      },
      getConnection: async () => { 
        throw new Error('Database connection failed: ' + error.message); 
      }
    };
  }
}

// Initialize pool
createPool().then(poolInstance => {
  pool = poolInstance;
}).catch(error => {
  console.error('❌ Failed to initialize database pool on startup:', error.message);
});

// Export pool
module.exports = {
  pool: pool || {
    execute: async () => { throw new Error('Pool not initialized'); },
    getConnection: async () => { throw new Error('Pool not initialized'); }
  },
  createPool
};