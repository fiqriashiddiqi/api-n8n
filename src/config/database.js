// src/config/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  // Try these hosts in order of preference:
  host: process.env.MYSQL_URL ? 
    new URL(process.env.MYSQL_URL).hostname : 
    (process.env.DB_HOST || 'mysql.railway.internal'), // Changed from tmysql
  
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'railway',
  port: process.env.MYSQL_URL ? 
    new URL(process.env.MYSQL_URL).port : 
    (process.env.DB_PORT || 3306),
  
  // Add connection stability options
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
};

const pool = mysql.createPool(dbConfig);

// Enhanced connection test with retry logic
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log('✅ Database connected successfully');
      connection.release();
      return true;
    } catch (error) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
      }
    }
  }
  return false;
}

module.exports = { pool, testConnection };
