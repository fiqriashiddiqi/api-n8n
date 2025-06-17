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
try {
  const userRoutes = require('./src/routes/users');
  app.use('/api', userRoutes); // Note: routes dalam users.js sudah include /users prefix
  console.log('✅ User routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load user routes:', error.message);
  
  // Fallback route jika users.js gagal load
  app.get('/api/users', (req, res) => {
    res.status(503).json({
      error: 'User routes not available',
      message: 'Routes failed to initialize',
      suggestion: 'Check database connection'
    });
  });
}

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
      'GET /api/users/test',
      'GET /api/debug/db-test',
      'POST /api/debug/create-tables',
      'GET /api/users',
      'GET /api/users/search',
      'GET /api/users/search/email/:email',
      'GET /api/stats/users',
      'POST /api/users',
      'GET /api/users/:id',
      'PATCH /api/users/:id',
      'DELETE /api/users/:id',
      'POST /api/users/bulk',
      'DELETE /api/users/bulk'
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
      message: dbConnected ? 'API and Railway MySQL are healthy' : 'API running but database issues',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'Railway MySQL Connected' : 'Connection Failed',
      platform: 'Railway',
      environment: process.env.RAILWAY_ENVIRONMENT || 'development',
      database_url_configured: !!process.env.MYSQL_URL,
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
    const { testConnection, getDatabaseInfo } = require('./src/config/database');
    
    console.log('🔄 Testing Railway MySQL connection...');
    const connected = await testConnection();
    
    if (connected) {
      const dbInfo = await getDatabaseInfo();
      
      res.json({
        status: 'SUCCESS',
        message: 'Railway MySQL connection working perfectly!',
        database_info: dbInfo,
        environment: {
          railway_env: process.env.RAILWAY_ENVIRONMENT,
          database_url_present: !!process.env.MYSQL_URL,
          node_env: process.env.NODE_ENV
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        status: 'ERROR',
        message: 'Database connection failed',
        suggestion: 'Make sure Railway MySQL is added to your project'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database test failed',
      error: error.message,
      suggestion: 'Check Railway MySQL configuration'
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
      const { testConnection, getDatabaseInfo } = require('./src/config/database');
      const dbConnected = await testConnection();
      
      if (dbConnected) {
        console.log('🗄️ Database: Railway MySQL Connected ✅');
        const dbInfo = await getDatabaseInfo();
        if (dbInfo) {
          console.log(`📊 MySQL Version: ${dbInfo.info.mysql_version}`);
          console.log(`📁 Database: ${dbInfo.info.database_name}`);
          console.log(`📋 Tables: ${dbInfo.tables_count} found`);
        }
      } else {
        console.log('🗄️ Database: Failed ❌');
        console.log('💡 Make sure to add MySQL database in Railway dashboard');
        console.log('💡 Railway dashboard → New → Database → Add MySQL');
      }
    } catch (error) {
      console.log(`🗄️ Database: Failed ❌ - ${error.message}`);
      if (error.message.includes('MYSQL_URL')) {
        console.log('💡 Add MySQL in Railway dashboard to get MYSQL_URL');
      }
    }
  }, 3000);
});

module.exports = app;