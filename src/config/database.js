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
    // Pool settings only - remove invalid options
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
    // Only valid pool options
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  };
}

console.log('🗄️ Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database
});

let pool;
let isConnected = false;

// Connection methods to try
const connectionMethods = [
  // Method 1: Try with IP (bypass DNS)
  {
    host: '185.224.138.9',
    user: 'sql12785091',
    password: 'f616rtqLdU',
    database: 'sql12785091',
    port: 3306,
    connectTimeout: 20000
  },
  // Method 2: Original hostname
  {
    host: 'sql12.freesqldatabase.com',
    user: 'sql12785091',
    password: 'f616rtqLdU',
    database: 'sql12785091',
    port: 3306,
    connectTimeout: 20000
  },
  // Method 3: With SSL
  {
    host: 'sql12.freesqldatabase.com',
    user: 'sql12785091',
    password: 'f616rtqLdU',
    database: 'sql12785091',
    port: 3306,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000
  }
];

async function createPoolWithFallback() {
  for (let i = 0; i < connectionMethods.length; i++) {
    const config = connectionMethods[i];
    console.log(`🔄 Trying connection method ${i + 1}/${connectionMethods.length}...`);
    console.log(`   Host: ${config.host}`);
    
    try {
      // Create pool with current config
      const testPool = mysql.createPool({
        ...config,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
      });
      
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
      
      // If this is the last method, don't wait
      if (i < connectionMethods.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.error('❌ All connection methods failed');
  return null;
}

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
  for (let i = 0; i < connectionMethods.length; i++) {
    try {
      console.log(`🔄 Testing direct connection method ${i + 1}...`);
      
      const connection = await mysql.createConnection(connectionMethods[i]);
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

// Get database instance
function getDatabase() {
  if (!pool) {
    console.log('⚠️ Database pool not initialized, creating new connection...');
    // Return a promise that creates a direct connection
    return {
      execute: async (query, params) => {
        // Try each connection method for direct query
        for (const config of connectionMethods) {
          try {
            const connection = await mysql.createConnection(config);
            const result = await connection.execute(query, params);
            await connection.end();
            return result;
          } catch (error) {
            console.error('Direct query failed:', error.message);
            continue;
          }
        }
        throw new Error('All database connection methods failed');
      }
    };
  }
  return pool;
}

// Initialize pool (non-blocking)
createPoolWithFallback().catch(err => {
  console.error('❌ Failed to initialize database pool:', err.message);
  isConnected = false;
});

// Export everything properly
const dbExports = {
  execute: async (query, params) => {
    if (pool && isConnected) {
      return pool.execute(query, params);
    } else {
      // Fallback to direct connection
      for (const config of connectionMethods) {
        try {
          const connection = await mysql.createConnection(config);
          const result = await connection.execute(query, params);
          await connection.end();
          return result;
        } catch (error) {
          console.error('Direct query failed:', error.message);
          continue;
        }
      }
      throw new Error('All database connection methods failed');
    }
  },
  getConnection: async () => {
    if (pool && isConnected) {
      return pool.getConnection();
    } else {
      // Create a single connection that mimics pool.getConnection()
      for (const config of connectionMethods) {
        try {
          const connection = await mysql.createConnection(config);
          // Add release method to mimic pool connection
          connection.release = async () => {
            await connection.end();
          };
          return connection;
        } catch (error) {
          continue;
        }
      }
      throw new Error('Failed to get database connection');
    }
  }
};

module.exports = dbExports;
module.exports.pool = dbExports; // Export as pool for compatibility
module.exports.testConnection = testConnection;
module.exports.testDirectConnection = testDirectConnection;
module.exports.isConnected = () => isConnected;
module.exports.getDatabase = getDatabase;