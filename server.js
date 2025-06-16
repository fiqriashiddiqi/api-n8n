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
    const db = require('./src/config/database');
    await db.execute('SELECT 1');
    
    res.json({ 
      status: 'OK', 
      message: 'API and database are healthy',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      platform: 'Railway',
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database connection failed',
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚂 Server running on Railway`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.RAILWAY_ENVIRONMENT || 'development'}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});

module.exports = app;