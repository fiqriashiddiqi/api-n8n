const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Railway automatically sets PORT
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const userRoutes = require('./src/routes/users');
app.use('/api/users', userRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'User API is running on Railway! 🚂',
    version: '1.0.0',
    platform: 'Railway',
    environment: process.env.RAILWAY_ENVIRONMENT || 'development',
    endpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/test-db',
      'GET /api/users',
      'GET /api/users/:id',
      'POST /api/users',
      'PUT /api/users/:id',
      'DELETE /api/users/:id'
    ]
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { testConnection } = require('./src/config/database');
    const dbConnected = await testConnection();
    
    res.json({ 
      status: dbConnected ? 'OK' : 'WARNING', 
      message: dbConnected ? 'API and database are healthy' : 'API running but database issues',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'Connected' : 'Connection Failed',
      platform: 'Railway',
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Database test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const db = require('./src/config/database');
    
    // Test basic connection
    const [rows] = await db.execute('SELECT 1 as test, NOW() as current_time, VERSION() as mysql_version');
    
    // Try to get table information
    const [tables] = await db.execute('SHOW TABLES');
    
    res.json({
      status: 'SUCCESS',
      message: 'Database connection working perfectly',
      test_result: rows[0],
      tables_count: tables.length,
      available_tables: tables.map(t => Object.values(t)[0]),
      connection_info: {
        host: 'sql12.freesqldatabase.com',
        database: 'sql12785091',
        user: 'sql12785091'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database test failed',
      error: error.message,
      error_code: error.code
    });
  }
});

// Create sample table endpoint (for testing)
app.post('/api/create-sample-table', async (req, res) => {
  try {
    const db = require('./src/config/database');
    
    // Create a simple users table for testing
    await db.execute(`
      CREATE TABLE IF NOT EXISTS test_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    res.json({
      status: 'SUCCESS',
      message: 'Sample table created successfully',
      table: 'test_users'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Failed to create sample table',
      error: error.message
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚂 Server running on Railway`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.RAILWAY_ENVIRONMENT || 'development'}`);
  
  // Test database connection after server starts
  setTimeout(async () => {
    try {
      const { testConnection } = require('./src/config/database');
      const dbConnected = await testConnection();
      console.log(`🗄️ Database: ${dbConnected ? 'Connected ✅' : 'Failed ❌'}`);
    } catch (error) {
      console.log(`🗄️ Database: Failed ❌ - ${error.message}`);
    }
  }, 3000); // Wait 3 seconds for network to settle
});

module.exports = app;