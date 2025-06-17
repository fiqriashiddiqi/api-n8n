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
      database_url_configured: !!process.env.DATABASE_URL,
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
          database_url_present: !!process.env.DATABASE_URL,
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

// Debug environment variables
app.get('/api/debug/env', (req, res) => {
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
    PORT: process.env.PORT,
    
    // Database URL variables
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
    MYSQL_URL: process.env.MYSQL_URL ? 'SET' : 'NOT_SET', 
    MYSQL_PRIVATE_URL: process.env.MYSQL_PRIVATE_URL ? 'SET' : 'NOT_SET',
    MYSQL_PUBLIC_URL: process.env.MYSQL_PUBLIC_URL ? 'SET' : 'NOT_SET',
    
    // Individual Railway MySQL variables (from screenshot)
    MYSQL_HOST: process.env.MYSQL_HOST ? 'SET' : 'NOT_SET',
    MYSQL_USER: process.env.MYSQL_USER ? 'SET' : 'NOT_SET',
    MYSQLUSER: process.env.MYSQLUSER ? 'SET' : 'NOT_SET',
    MYSQL_ROOT_PASSWORD: process.env.MYSQL_ROOT_PASSWORD ? 'SET' : 'NOT_SET',
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD ? 'SET' : 'NOT_SET',
    MYSQL_DATABASE: process.env.MYSQL_DATABASE ? 'SET' : 'NOT_SET',
    MYSQLDATABASE: process.env.MYSQLDATABASE ? 'SET' : 'NOT_SET',
    MYSQL_PORT: process.env.MYSQL_PORT ? 'SET' : 'NOT_SET',
    MYSQLPORT: process.env.MYSQLPORT ? 'SET' : 'NOT_SET',
    
    // Show preview (first 30 chars only for security)
    mysql_url_preview: process.env.MYSQL_URL ? 
      process.env.MYSQL_URL.substring(0, 40) + '...' : 'Not set',
    mysql_host_preview: process.env.MYSQL_HOST || 'Not set',
    mysql_database_preview: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'Not set',
    mysql_user_preview: process.env.MYSQL_USER || process.env.MYSQLUSER || 'Not set',
      
    // Count total env vars
    total_env_vars: Object.keys(process.env).length,
    
    // All Railway/MySQL specific vars
    railway_mysql_vars: Object.keys(process.env)
      .filter(key => key.includes('RAILWAY') || key.includes('MYSQL'))
      .reduce((obj, key) => {
        obj[key] = process.env[key] ? 'SET' : 'NOT_SET';
        return obj;
      }, {})
  };
  
  res.json({
    message: 'Railway MySQL Environment Variables Debug',
    timestamp: new Date().toISOString(),
    environment: envVars
  });
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
      if (error.message.includes('DATABASE_URL')) {
        console.log('💡 Add MySQL in Railway dashboard to get DATABASE_URL');
      }
    }
  }, 3000);
});

module.exports = app;