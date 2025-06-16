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
    // Pool settings only
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
} else {
  // FreeSQLDatabase atau local development
  dbConfig = {
    host: process.env.DB_HOST || 'sql12.freesqldatabase.com',
    user: process.env.DB_USER || 'sql12785091',
    password: process.env.DB_PASSWORD || 'f616rtqLdU',
    database: process.env.DB_NAME || 'sql12785091',
    port: parseInt(process.env.DB_PORT || '3306'),
    // Pool settings only (remove invalid options)
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    // Connection timeout settings
    connectTimeout: 20000,
    acquireTimeout: 20000,
    // SSL disabled for freesqldatabase
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
let isConnected = false;

// Alternative connection methods
const connectionMethods = [
  // Method 1: Direct IP (bypass DNS)
  {
    ...dbConfig,
    host: '185.224.138.9', // Try with IP instead of hostname
    ssl: false
  },
  // Method 2: Original with SSL
  {
    ...dbConfig,
    ssl: { rejectUnauthorized: false }
  },
  // Method 3: With different timeout
  {
    ...dbConfig,
    connectTimeout: 30000,
    ssl: false
  }
];

async function createPoolWithFallback() {
  for (let i = 0; i < connectionMethods.length; i++) {
    const config = connectionMethods[i];
    console.log(`🔄 Trying connection method ${i + 1}/${connectionMethods.length}...`);
    console.log(`   Host: ${config.host}`);
    console.log(`   SSL: ${!!config.ssl}`);
    
    try {
      // Create pool with current config
      const testPool = mysql.createPool(config);
      
      // Test connection
      const connection = await testPool.getConnection();
      await connection.execute('SELECT 1 as test');
      connection.release();
      
      console.log(`✅ Connection method ${i + 1} successful!`);
      pool = testPool;
      isConnected = true;
      return pool;
      
    } catch (error) {
      console.error(`❌ Connection method ${i + 1} failed:`, error.message);
      
      // Clean up failed pool
      try {
        if (testPool) {
          await testPool.end();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // If this is the last method, throw the error
      if (i === connectionMethods.length - 1) {
        throw error;
      }
      
      // Wait before trying next method
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Initialize pool
createPoolWithFallback().catch(err => {
  console.error('❌ All connection methods failed:', err.message);
  isConnected = false;
});

// Test connection function
async function testConnection() {
  try {
    if (!pool || !isConnected) {
      console.log('🔄 Pool not ready, attempting to create...');
      await createPoolWithFallback();
    }
    
    if (!pool) {
      throw new Error('Failed to create database pool');
    }
    
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1 as test, NOW() as current_time');
    connection.release();
    
    console.log('✅ Database connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    isConnected = false;
    return false;
  }
}

// Alternative direct connection (bypass pool)
async function testDirectConnection() {
  const directMethods = [
    // Method 1: Try with IP
    {
      host: '185.224.138.9',
      user: 'sql12785091',
      password: 'f616rtqLdU',
      database: 'sql12785091',
      port: 3306,
      ssl: false,
      connectTimeout: 30000
    },
    // Method 2: Original hostname
    {
      host: 'sql12.freesqldatabase.com',
      user: 'sql12785091',
      password: 'f616rtqLdU',
      database: 'sql12785091',
      port: 3306,
      ssl: false,
      connectTimeout: 30000
    }
  ];
  
  for (let i = 0; i < directMethods.length; i++) {
    try {
      console.log(`🔄 Testing direct connection method ${i + 1}...`);
      
      const connection = await mysql.createConnection(directMethods[i]);
      await connection.execute('SELECT 1 as test');
      await connection.end();
      
      console.log(`✅ Direct connection method ${i + 1} successful!`);
      return true;
      
    } catch (error) {
      console.error(`❌ Direct connection method ${i + 1} failed:`, error.message);
    }
  }
  
  return false;
}

module.exports = pool;
module.exports.testConnection = testConnection;
module.exports.testDirectConnection = testDirectConnection;
module.exports.isConnected = () => isConnected;