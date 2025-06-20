// src/config/database.js - FIXED VERSION
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  // Try these hosts in order of preference:
  host: process.env.MYSQL_URL ? 
    new URL(process.env.MYSQL_URL).hostname : 
    (process.env.DB_HOST || 'mysql.railway.internal'),
  
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || 'DYchNFdlLeBxiWfIJMOBUnyDEWmbCRtd',
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'railway',
  port: process.env.MYSQL_URL ? 
    new URL(process.env.MYSQL_URL).port : 
    (process.env.DB_PORT || 3306),
  
  // FIXED: Only use valid MySQL2 options
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  
  // Connection-level options (valid for MySQL2)
  connectTimeout: 60000,    // Replaces 'timeout'
  ssl: false,
  timezone: 'Z'
  
  // REMOVED these invalid options that were causing warnings:
  // acquireTimeout: 60000,  // Not valid for individual connections
  // timeout: 60000,         // Not valid for MySQL2
  // reconnect: true,        // Not valid for MySQL2
};

const pool = mysql.createPool(dbConfig);

// Enhanced connection test with retry logic
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log('✅ Database connected successfully');
      
      // Test a simple query to ensure everything works
      const [rows] = await connection.execute('SELECT 1 as test');
      console.log('✅ Database query test passed');
      
      connection.release();
      return true;
    } catch (error) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
      }
    }
  }
  console.error('❌ All database connection attempts failed');
  return false;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connection pool...');
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
  } catch (error) {
    console.error('❌ Error closing database pool:', error.message);
  }
  process.exit(0);
});

// Optional: Test connection on startup
testConnection().then(success => {
  if (!success) {
    console.error('⚠️  Initial database connection failed - server may have issues');
  }
});

module.exports = { pool, testConnection };
