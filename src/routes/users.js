// src/routes/users.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Import database dengan fallback handling
let pool;
try {
  const dbModule = require('../config/database');
  pool = dbModule.pool || dbModule; // Support both export styles
  console.log('✅ Database module imported successfully');
} catch (error) {
  console.error('❌ Failed to import database module:', error.message);
  // Create a mock pool for testing
  pool = {
    execute: async () => { throw new Error('Database not available'); },
    getConnection: async () => { throw new Error('Database not available'); }
  };
}

// Function untuk generate random ID
function generateRandomId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// Function untuk check apakah ID sudah ada
async function isIdExists(connection, id) {
  try {
    const [existing] = await connection.execute('SELECT id FROM users WHERE id = ?', [id]);
    return existing.length > 0;
  } catch (error) {
    console.error('Error checking ID existence:', error.message);
    return false;
  }
}

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Database connection check middleware
const checkDbConnection = async (req, res, next) => {
  try {
    // Quick connection test
    await pool.execute('SELECT 1');
    next();
  } catch (error) {
    console.error('Database connection check failed:', error.message);
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Database connection failed',
      suggestion: 'Please try again later'
    });
  }
};

// =============================================================================
// DEBUG ENDPOINTS (for troubleshooting)
// =============================================================================

// Simple test route (no database required)
router.get('/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    routes_available: true
  });
});

// Debug database connection
router.get('/debug/db-test', asyncHandler(async (req, res) => {
  try {
    // Test basic connection
    await pool.execute('SELECT 1 as test');
    
    // Get database info
    const [dbInfo] = await pool.execute(`
      SELECT 
        DATABASE() as database_name,
        VERSION() as mysql_version,
        USER() as current_user
    `);
    
    // Try to get table info
    const [tables] = await pool.execute('SHOW TABLES');
    
    // If users table exists, get count
    const userTableExists = tables.some(table => 
      Object.values(table)[0].toLowerCase() === 'users'
    );
    
    let userStats = null;
    if (userTableExists) {
      try {
        const [result] = await pool.execute('SELECT COUNT(*) as count FROM users');
        const [sampleUsers] = await pool.execute('SELECT id, username, email, first_name FROM users LIMIT 3');
        userStats = {
          total_users: result[0].count,
          sample_users: sampleUsers
        };
      } catch (userError) {
        userStats = { error: 'Failed to query users table: ' + userError.message };
      }
    }
    
    res.json({
      database_connected: true,
      database_info: dbInfo[0],
      available_tables: tables.map(t => Object.values(t)[0]),
      users_table_exists: userTableExists,
      user_stats: userStats,
      message: "Railway MySQL connection successful!",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      database_connected: false,
      error: error.message,
      error_code: error.code,
      suggestion: 'Make sure Railway MySQL is properly configured'
    });
  }
}));

// Create tables endpoint
router.post('/debug/create-tables', asyncHandler(async (req, res) => {
  try {
    // Create users table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        phone VARCHAR(20),
        date_of_birth DATE,
        gender ENUM('male', 'female', 'other'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )
    `);

    // Create user_accounts table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT,
        status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
        role ENUM('user', 'admin', 'moderator', 'editor') DEFAULT 'user',
        subscription ENUM('free', 'basic', 'premium', 'enterprise') DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create user_addresses table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT,
        street VARCHAR(255),
        city VARCHAR(100),
        province VARCHAR(100),
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'Indonesia',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create user_preferences table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT,
        language VARCHAR(10) DEFAULT 'en',
        timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
        notify_email BOOLEAN DEFAULT TRUE,
        notify_sms BOOLEAN DEFAULT FALSE,
        notify_push BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create user_profiles table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT,
        avatar VARCHAR(255),
        bio TEXT,
        website VARCHAR(255),
        instagram VARCHAR(100),
        linkedin VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    res.json({
      success: true,
      message: 'All tables created successfully',
      tables: ['users', 'user_accounts', 'user_addresses', 'user_preferences', 'user_profiles']
    });

  } catch (error) {
    console.error('Create tables error:', error);
    res.status(500).json({
      error: 'Failed to create tables',
      message: error.message,
      suggestion: 'Check database permissions'
    });
  }
}));

// Import sample data endpoint
router.post('/debug/import-sample-data', asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Starting sample data import...');
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Sample users data from your SQL dump
      const sampleUsers = [
        {
          id: 1,
          username: 'johndoe',
          email: 'john.doe@email.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+6281234567890',
          date_of_birth: '1990-05-15',
          gender: 'male',
          created_at: '2024-01-15 10:30:00',
          updated_at: '2025-06-10 14:20:00'
        },
        {
          id: 2,
          username: 'janesmith',
          email: 'jane.smith@email.com',
          first_name: 'Jane',
          last_name: 'Smith',
          phone: '+6281234567891',
          date_of_birth: '1988-08-22',
          gender: 'female',
          created_at: '2024-02-20 11:45:00',
          updated_at: '2025-06-12 16:30:00'
        },
        {
          id: 3,
          username: 'bobwilson',
          email: 'bob.wilson@email.com',
          first_name: 'Bob',
          last_name: 'Wilson',
          phone: '+6281234567892',
          date_of_birth: '1992-12-03',
          gender: 'male',
          created_at: '2024-03-10 09:20:00',
          updated_at: '2025-06-11 13:15:00'
        },
        {
          id: 4,
          username: 'alicejohnson',
          email: 'alice.johnson@email.com',
          first_name: 'Alice',
          last_name: 'Johnson',
          phone: '+6281234567893',
          date_of_birth: '1995-07-18',
          gender: 'female',
          created_at: '2024-04-05 14:10:00',
          updated_at: '2025-06-13 10:45:00'
        },
        {
          id: 5,
          username: 'mikebrown',
          email: 'mike.brown@email.com',
          first_name: 'Mike',
          last_name: 'Brown',
          phone: '+6281234567894',
          date_of_birth: '1987-11-25',
          gender: 'male',
          created_at: '2024-05-12 16:25:00',
          updated_at: '2025-06-09 12:20:00'
        }
      ];

      // Insert users
      console.log('📝 Inserting users...');
      for (const user of sampleUsers) {
        await connection.execute(`
          INSERT INTO users (id, username, email, first_name, last_name, phone, date_of_birth, gender, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          updated_at = VALUES(updated_at)
        `, [
          user.id, user.username, user.email, user.first_name, user.last_name,
          user.phone, user.date_of_birth, user.gender, user.created_at, user.updated_at
        ]);
      }

      // Insert user accounts
      console.log('👤 Inserting user accounts...');
      const userAccounts = [
        { user_id: 1, status: 'active', role: 'admin', subscription: 'premium' },
        { user_id: 2, status: 'active', role: 'user', subscription: 'basic' },
        { user_id: 3, status: 'inactive', role: 'user', subscription: 'free' },
        { user_id: 4, status: 'active', role: 'moderator', subscription: 'premium' },
        { user_id: 5, status: 'suspended', role: 'user', subscription: 'basic' }
      ];

      for (const account of userAccounts) {
        await connection.execute(`
          INSERT INTO user_accounts (user_id, status, role, subscription)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          role = VALUES(role),
          subscription = VALUES(subscription)
        `, [account.user_id, account.status, account.role, account.subscription]);
      }

      // Insert user addresses
      console.log('🏠 Inserting user addresses...');
      const userAddresses = [
        { user_id: 1, street: 'Jl. Sudirman No. 123', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '10220', country: 'Indonesia' },
        { user_id: 2, street: 'Jl. Gatot Subroto No. 456', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '12950', country: 'Indonesia' },
        { user_id: 3, street: 'Jl. Malioboro No. 789', city: 'Yogyakarta', province: 'Yogyakarta', postal_code: '55271', country: 'Indonesia' },
        { user_id: 4, street: 'Jl. Braga No. 321', city: 'Bandung', province: 'Jawa Barat', postal_code: '40111', country: 'Indonesia' },
        { user_id: 5, street: 'Jl. Thamrin No. 654', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '10350', country: 'Indonesia' }
      ];

      for (const address of userAddresses) {
        await connection.execute(`
          INSERT INTO user_addresses (user_id, street, city, province, postal_code, country)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          street = VALUES(street),
          city = VALUES(city),
          province = VALUES(province)
        `, [address.user_id, address.street, address.city, address.province, address.postal_code, address.country]);
      }

      // Insert user preferences
      console.log('⚙️ Inserting user preferences...');
      const userPreferences = [
        { user_id: 1, language: 'id', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 1, notify_push: 1 },
        { user_id: 2, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 0, notify_push: 1 },
        { user_id: 3, language: 'id', timezone: 'Asia/Jakarta', notify_email: 0, notify_sms: 0, notify_push: 0 },
        { user_id: 4, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 1, notify_push: 0 },
        { user_id: 5, language: 'id', timezone: 'Asia/Jakarta', notify_email: 0, notify_sms: 1, notify_push: 1 }
      ];

      for (const pref of userPreferences) {
        await connection.execute(`
          INSERT INTO user_preferences (user_id, language, timezone, notify_email, notify_sms, notify_push)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          language = VALUES(language),
          timezone = VALUES(timezone)
        `, [pref.user_id, pref.language, pref.timezone, pref.notify_email, pref.notify_sms, pref.notify_push]);
      }

      // Insert user profiles
      console.log('👤 Inserting user profiles...');
      const userProfiles = [
        { 
          user_id: 1, 
          avatar: 'https://example.com/avatars/john_doe.jpg',
          bio: 'Passionate software developer and tech enthusiast. Love coding and solving complex problems.',
          website: 'https://johndoe.dev',
          instagram: 'johndoe_dev',
          linkedin: 'https://linkedin.com/in/johndoe'
        },
        { 
          user_id: 2, 
          avatar: 'https://example.com/avatars/jane_smith.jpg',
          bio: 'Digital marketing specialist with 5+ years experience. Coffee lover and travel enthusiast.',
          website: 'https://janesmith.com',
          instagram: 'jane_marketing',
          linkedin: 'https://linkedin.com/in/janesmith'
        },
        { 
          user_id: 3, 
          avatar: 'https://example.com/avatars/bob_wilson.jpg',
          bio: 'Graphic designer creating beautiful visual experiences. Always learning new design trends.',
          website: 'https://bobwilson.design',
          instagram: 'bob_designs',
          linkedin: 'https://linkedin.com/in/bobwilson'
        },
        { 
          user_id: 4, 
          avatar: 'https://example.com/avatars/alice_johnson.jpg',
          bio: 'Project manager coordinating teams to deliver exceptional results. Agile methodology advocate.',
          website: 'https://alicejohnson.pm',
          instagram: 'alice_pm',
          linkedin: 'https://linkedin.com/in/alicejohnson'
        },
        { 
          user_id: 5, 
          avatar: 'https://example.com/avatars/mike_brown.jpg',
          bio: 'Data scientist exploring insights from complex datasets. Python and R enthusiast.',
          website: 'https://mikebrown.data',
          instagram: 'mike_data',
          linkedin: 'https://linkedin.com/in/mikebrown'
        }
      ];

      for (const profile of userProfiles) {
        await connection.execute(`
          INSERT INTO user_profiles (user_id, avatar, bio, website, instagram, linkedin)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          bio = VALUES(bio),
          website = VALUES(website)
        `, [profile.user_id, profile.avatar, profile.bio, profile.website, profile.instagram, profile.linkedin]);
      }

      await connection.commit();
      console.log('✅ Sample data imported successfully');

      // Get final count
      const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
      
      res.json({
        success: true,
        message: 'Sample data imported successfully',
        imported: {
          users: sampleUsers.length,
          accounts: userAccounts.length,
          addresses: userAddresses.length,
          preferences: userPreferences.length,
          profiles: userProfiles.length
        },
        total_users_in_db: userCount[0].count
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ Sample data import failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import sample data',
      message: error.message
    });
  }
}));

// Add missing columns to existing tables
router.post('/debug/update-table-structure', asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Updating table structure...');
    
    // Add last_login column if it doesn't exist
    try {
      await pool.execute(`
        ALTER TABLE users 
        ADD COLUMN last_login TIMESTAMP NULL
      `);
      console.log('✅ Added last_login column to users table');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ last_login column already exists');
      } else {
        console.log('⚠️ Error adding last_login column:', error.message);
      }
    }

    // Check current table structure
    const [columns] = await pool.execute('DESCRIBE users');
    
    res.json({
      success: true,
      message: 'Table structure updated successfully',
      current_columns: columns.map(col => ({
        field: col.Field,
        type: col.Type,
        null: col.Null,
        key: col.Key,
        default: col.Default
      }))
    });

  } catch (error) {
    console.error('❌ Table structure update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update table structure',
      message: error.message
    });
  }
}));


router.post('/debug/import-full-data', asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Starting FULL database import from SQL dump...');
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // FULL users data from SQL dump (16 users)
      const allUsers = [
        {
          id: 1,
          username: 'johndoe',
          email: 'john.doe@email.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+6281234567890',
          date_of_birth: '1990-05-15',
          gender: 'male',
          created_at: '2024-01-15 10:30:00',
          updated_at: '2025-06-10 14:20:00',
          last_login: '2025-06-13 09:15:00'
        },
        {
          id: 2,
          username: 'janesmith',
          email: 'jane.smith@email.com',
          first_name: 'Jane',
          last_name: 'Smith',
          phone: '+6281234567891',
          date_of_birth: '1988-08-22',
          gender: 'female',
          created_at: '2024-02-20 11:45:00',
          updated_at: '2025-06-12 16:30:00',
          last_login: '2025-06-12 20:45:00'
        },
        {
          id: 3,
          username: 'bobwilson',
          email: 'bob.wilson@email.com',
          first_name: 'Bob',
          last_name: 'Wilson',
          phone: '+6281234567892',
          date_of_birth: '1992-12-03',
          gender: 'male',
          created_at: '2024-03-10 09:20:00',
          updated_at: '2025-06-11 13:15:00',
          last_login: '2025-06-11 18:20:00'
        },
        {
          id: 4,
          username: 'alicejohnson',
          email: 'alice.johnson@email.com',
          first_name: 'Alice',
          last_name: 'Johnson',
          phone: '+6281234567893',
          date_of_birth: '1995-07-18',
          gender: 'female',
          created_at: '2024-04-05 14:10:00',
          updated_at: '2025-06-13 10:45:00',
          last_login: '2025-06-13 07:30:00'
        },
        {
          id: 5,
          username: 'mikebrown',
          email: 'mike.brown@email.com',
          first_name: 'Mike',
          last_name: 'Brown',
          phone: '+6281234567894',
          date_of_birth: '1987-11-25',
          gender: 'male',
          created_at: '2024-05-12 16:25:00',
          updated_at: '2025-06-09 12:20:00',
          last_login: '2025-06-09 19:10:00'
        },
        {
          id: 6,
          username: 'sarahdavis',
          email: 'sarah.davis@email.com',
          first_name: 'Sarah',
          last_name: 'Davis',
          phone: '+6281234567895',
          date_of_birth: '1993-04-07',
          gender: 'female',
          created_at: '2024-06-18 08:40:00',
          updated_at: '2025-06-08 15:35:00',
          last_login: '2025-06-08 21:25:00'
        },
        {
          id: 7,
          username: 'tomlee',
          email: 'tom.lee@email.com',
          first_name: 'Tom',
          last_name: 'Lee',
          phone: '+6281234567896',
          date_of_birth: '1991-09-14',
          gender: 'male',
          created_at: '2024-07-22 12:15:00',
          updated_at: '2025-06-13 11:50:00',
          last_login: '2025-06-13 06:40:00'
        },
        {
          id: 8,
          username: 'emmawhite',
          email: 'emma.white@email.com',
          first_name: 'Emma',
          last_name: 'White',
          phone: '+6281234567897',
          date_of_birth: '1989-01-30',
          gender: 'female',
          created_at: '2024-08-30 17:20:00',
          updated_at: '2025-06-10 09:25:00',
          last_login: '2025-06-10 22:15:00'
        },
        {
          id: 9,
          username: 'davidgreen',
          email: 'david.green@email.com',
          first_name: 'David',
          last_name: 'Green',
          phone: '+6281234567898',
          date_of_birth: '1994-06-12',
          gender: 'male',
          created_at: '2024-09-14 13:55:00',
          updated_at: '2025-06-07 17:40:00',
          last_login: '2025-06-07 20:30:00'
        },
        {
          id: 10,
          username: 'lisagarcia',
          email: 'lisa.garcia@email.com',
          first_name: 'Lisa',
          last_name: 'Garcia',
          phone: '+6281234567899',
          date_of_birth: '1986-10-28',
          gender: 'other',
          created_at: '2024-10-28 19:30:00',
          updated_at: '2025-06-12 14:10:00',
          last_login: '2025-06-12 16:50:00'
        },
        {
          id: 1749961807199242,
          username: 'user877mmm',
          email: 'tesusert309@example.commm',
          first_name: 'Test',
          last_name: 'User',
          phone: '+628123456789',
          date_of_birth: '1995-01-01',
          gender: 'male',
          created_at: '2025-06-15 11:30:07',
          updated_at: '2025-06-15 11:30:07',
          last_login: null
        },
        {
          id: 1749991738656134,
          username: 'fiqri590',
          email: 'fiqri387@example.com',
          first_name: 'Test',
          last_name: 'User',
          phone: '+628123456789',
          date_of_birth: '1995-05-01',
          gender: 'male',
          created_at: '2025-06-15 19:48:58',
          updated_at: '2025-06-15 19:48:58',
          last_login: null
        },
        {
          id: 1750002578460265,
          username: 'johndoels',
          email: 'john@email.com',
          first_name: 'John',
          last_name: 'Does',
          phone: null,
          date_of_birth: null,
          gender: null,
          created_at: '2025-06-15 22:49:38',
          updated_at: '2025-06-15 22:49:38',
          last_login: null
        },
        {
          id: 1750004574643469,
          username: 'johndoes',
          email: 'zoh@email.com',
          first_name: 'zohn',
          last_name: 'Doe',
          phone: '081234567890',
          date_of_birth: '1990-01-15',
          gender: 'male',
          created_at: '2025-06-15 23:22:54',
          updated_at: '2025-06-15 23:22:54',
          last_login: null
        },
        {
          id: 1750039448975818,
          username: 'johcerna',
          email: 'kcerna@email.com',
          first_name: 'John',
          last_name: 'Cerna',
          phone: '081234567890',
          date_of_birth: '1996-01-15',
          gender: 'male',
          created_at: '2025-06-16 09:04:08',
          updated_at: '2025-06-16 09:04:08',
          last_login: null
        },
        {
          id: 1750042575369811,
          username: 'pupupapa',
          email: 'pupu@email.com',
          first_name: 'pupu',
          last_name: 'papa',
          phone: '081234567890',
          date_of_birth: '1990-01-15',
          gender: 'female',
          created_at: '2025-06-16 09:56:15',
          updated_at: '2025-06-16 09:56:15',
          last_login: null
        }
      ];

      // Insert users
      console.log('📝 Inserting all 16 users...');
      for (const user of allUsers) {
        await connection.execute(`
          INSERT INTO users (id, username, email, first_name, last_name, phone, date_of_birth, gender, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          updated_at = VALUES(updated_at)
        `, [
          user.id, user.username, user.email, user.first_name, user.last_name,
          user.phone, user.date_of_birth, user.gender, user.created_at, user.updated_at
        ]);
      }

      // Insert user accounts (12 accounts from SQL dump)
      console.log('👤 Inserting user accounts...');
      const userAccounts = [
        { user_id: 1, status: 'active', role: 'admin', subscription: 'premium' },
        { user_id: 2, status: 'active', role: 'user', subscription: 'basic' },
        { user_id: 3, status: 'inactive', role: 'user', subscription: 'free' },
        { user_id: 4, status: 'active', role: 'moderator', subscription: 'premium' },
        { user_id: 5, status: 'suspended', role: 'user', subscription: 'basic' },
        { user_id: 6, status: 'active', role: 'user', subscription: 'premium' },
        { user_id: 7, status: 'active', role: 'user', subscription: 'free' },
        { user_id: 8, status: 'active', role: 'editor', subscription: 'premium' },
        { user_id: 9, status: 'inactive', role: 'user', subscription: 'basic' },
        { user_id: 10, status: 'active', role: 'user', subscription: 'premium' },
        { user_id: 1749961807199242, status: 'active', role: 'user', subscription: 'basic' },
        { user_id: 1749991738656134, status: 'active', role: 'user', subscription: 'basic' }
      ];

      for (const account of userAccounts) {
        await connection.execute(`
          INSERT INTO user_accounts (user_id, status, role, subscription)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          role = VALUES(role),
          subscription = VALUES(subscription)
        `, [account.user_id, account.status, account.role, account.subscription]);
      }

      // Insert user addresses (12 addresses from SQL dump)
      console.log('🏠 Inserting user addresses...');
      const userAddresses = [
        { user_id: 1, street: 'Jl. Sudirman No. 123', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '10220', country: 'Indonesia' },
        { user_id: 2, street: 'Jl. Gatot Subroto No. 456', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '12950', country: 'Indonesia' },
        { user_id: 3, street: 'Jl. Malioboro No. 789', city: 'Yogyakarta', province: 'Yogyakarta', postal_code: '55271', country: 'Indonesia' },
        { user_id: 4, street: 'Jl. Braga No. 321', city: 'Bandung', province: 'Jawa Barat', postal_code: '40111', country: 'Indonesia' },
        { user_id: 5, street: 'Jl. Thamrin No. 654', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '10350', country: 'Indonesia' },
        { user_id: 6, street: 'Jl. Diponegoro No. 987', city: 'Semarang', province: 'Jawa Tengah', postal_code: '50241', country: 'Indonesia' },
        { user_id: 7, street: 'Jl. Pemuda No. 147', city: 'Surabaya', province: 'Jawa Timur', postal_code: '60271', country: 'Indonesia' },
        { user_id: 8, street: 'Jl. Ahmad Yani No. 258', city: 'Bandung', province: 'Jawa Barat', postal_code: '40243', country: 'Indonesia' },
        { user_id: 9, street: 'Jl. Gajah Mada No. 369', city: 'Medan', province: 'Sumatera Utara', postal_code: '20212', country: 'Indonesia' },
        { user_id: 10, street: 'Jl. Hayam Wuruk No. 741', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '11180', country: 'Indonesia' },
        { user_id: 1749961807199242, street: 'Jl. Test No. 1236789', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '12345', country: 'Indonesia' },
        { user_id: 1749991738656134, street: 'Jl. Test No. 123', city: 'Jakarta', province: 'DKI Jakarta', postal_code: '12345', country: 'Indonesia' }
      ];

      for (const address of userAddresses) {
        await connection.execute(`
          INSERT INTO user_addresses (user_id, street, city, province, postal_code, country)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          street = VALUES(street),
          city = VALUES(city),
          province = VALUES(province)
        `, [address.user_id, address.street, address.city, address.province, address.postal_code, address.country]);
      }

      // Insert user preferences (12 preferences from SQL dump)
      console.log('⚙️ Inserting user preferences...');
      const userPreferences = [
        { user_id: 1, language: 'id', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 1, notify_push: 1 },
        { user_id: 2, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 0, notify_push: 1 },
        { user_id: 3, language: 'id', timezone: 'Asia/Jakarta', notify_email: 0, notify_sms: 0, notify_push: 0 },
        { user_id: 4, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 1, notify_push: 0 },
        { user_id: 5, language: 'id', timezone: 'Asia/Jakarta', notify_email: 0, notify_sms: 1, notify_push: 1 },
        { user_id: 6, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 1, notify_push: 1 },
        { user_id: 7, language: 'id', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 0, notify_push: 0 },
        { user_id: 8, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 1, notify_push: 1 },
        { user_id: 9, language: 'id', timezone: 'Asia/Jakarta', notify_email: 0, notify_sms: 0, notify_push: 1 },
        { user_id: 10, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 0, notify_push: 1 },
        { user_id: 1749961807199242, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 0, notify_push: 1 },
        { user_id: 1749991738656134, language: 'en', timezone: 'Asia/Jakarta', notify_email: 1, notify_sms: 0, notify_push: 1 }
      ];

      for (const pref of userPreferences) {
        await connection.execute(`
          INSERT INTO user_preferences (user_id, language, timezone, notify_email, notify_sms, notify_push)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          language = VALUES(language),
          timezone = VALUES(timezone)
        `, [pref.user_id, pref.language, pref.timezone, pref.notify_email, pref.notify_sms, pref.notify_push]);
      }

      // Insert user profiles (12 profiles from SQL dump)
      console.log('👤 Inserting user profiles...');
      const userProfiles = [
        { 
          user_id: 1, 
          avatar: 'https://example.com/avatars/john_doe.jpg',
          bio: 'Passionate software developer and tech enthusiast. Love coding and solving complex problems.',
          website: 'https://johndoe.dev',
          instagram: 'johndoe_dev',
          linkedin: 'https://linkedin.com/in/johndoe'
        },
        { 
          user_id: 2, 
          avatar: 'https://example.com/avatars/jane_smith.jpg',
          bio: 'Digital marketing specialist with 5+ years experience. Coffee lover and travel enthusiast.',
          website: 'https://janesmith.com',
          instagram: 'jane_marketing',
          linkedin: 'https://linkedin.com/in/janesmith'
        },
        { 
          user_id: 3, 
          avatar: 'https://example.com/avatars/bob_wilson.jpg',
          bio: 'Graphic designer creating beautiful visual experiences. Always learning new design trends.',
          website: 'https://bobwilson.design',
          instagram: 'bob_designs',
          linkedin: 'https://linkedin.com/in/bobwilson'
        },
        { 
          user_id: 4, 
          avatar: 'https://example.com/avatars/alice_johnson.jpg',
          bio: 'Project manager coordinating teams to deliver exceptional results. Agile methodology advocate.',
          website: 'https://alicejohnson.pm',
          instagram: 'alice_pm',
          linkedin: 'https://linkedin.com/in/alicejohnson'
        },
        { 
          user_id: 5, 
          avatar: 'https://example.com/avatars/mike_brown.jpg',
          bio: 'Data scientist exploring insights from complex datasets. Python and R enthusiast.',
          website: 'https://mikebrown.data',
          instagram: 'mike_data',
          linkedin: 'https://linkedin.com/in/mikebrown'
        },
        { 
          user_id: 6, 
          avatar: 'https://example.com/avatars/sarah_davis.jpg',
          bio: 'UX/UI designer focused on creating intuitive user experiences. Design thinking practitioner.',
          website: 'https://sarahdavis.ux',
          instagram: 'sarah_ux',
          linkedin: 'https://linkedin.com/in/sarahdavis'
        },
        { 
          user_id: 7, 
          avatar: 'https://example.com/avatars/tom_lee.jpg',
          bio: 'Full-stack developer building scalable web applications. Open source contributor.',
          website: 'https://tomlee.dev',
          instagram: 'tom_fullstack',
          linkedin: 'https://linkedin.com/in/tomlee'
        },
        { 
          user_id: 8, 
          avatar: 'https://example.com/avatars/emma_white.jpg',
          bio: 'Content strategist crafting compelling narratives. SEO and content marketing expert.',
          website: 'https://emmawhite.content',
          instagram: 'emma_content',
          linkedin: 'https://linkedin.com/in/emmawhite'
        },
        { 
          user_id: 9, 
          avatar: 'https://example.com/avatars/david_green.jpg',
          bio: 'DevOps engineer automating deployment processes. Cloud infrastructure specialist.',
          website: 'https://davidgreen.devops',
          instagram: 'david_devops',
          linkedin: 'https://linkedin.com/in/davidgreen'
        },
        { 
          user_id: 10, 
          avatar: 'https://example.com/avatars/lisa_garcia.jpg',
          bio: 'Business analyst bridging the gap between business and technology. Process optimization expert.',
          website: 'https://lisagarcia.ba',
          instagram: 'lisa_ba',
          linkedin: 'https://linkedin.com/in/lisagarcia'
        },
        { 
          user_id: 1749961807199242, 
          avatar: 'https://example.com/avatar.jpg',
          bio: 'Test user bio',
          website: 'https://testuser.com',
          instagram: 'testuser123',
          linkedin: 'https://linkedin.com/in/testuser'
        },
        { 
          user_id: 1749991738656134, 
          avatar: 'https://example.com/avatar.jpg',
          bio: 'Test user bio',
          website: 'https://testuser.com',
          instagram: 'testuser123',
          linkedin: 'https://linkedin.com/in/testuser'
        }
      ];

      for (const profile of userProfiles) {
        await connection.execute(`
          INSERT INTO user_profiles (user_id, avatar, bio, website, instagram, linkedin)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          bio = VALUES(bio),
          website = VALUES(website)
        `, [profile.user_id, profile.avatar, profile.bio, profile.website, profile.instagram, profile.linkedin]);
      }

      await connection.commit();
      console.log('✅ FULL database import completed successfully');

      // Get final count
      const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
      const [accountCount] = await connection.execute('SELECT COUNT(*) as count FROM user_accounts');
      const [addressCount] = await connection.execute('SELECT COUNT(*) as count FROM user_addresses');
      const [prefCount] = await connection.execute('SELECT COUNT(*) as count FROM user_preferences');
      const [profileCount] = await connection.execute('SELECT COUNT(*) as count FROM user_profiles');
      
      res.json({
        success: true,
        message: 'FULL database imported successfully from SQL dump',
        imported: {
          users: allUsers.length,
          accounts: userAccounts.length,
          addresses: userAddresses.length,
          preferences: userPreferences.length,
          profiles: userProfiles.length
        },
        final_counts: {
          total_users_in_db: userCount[0].count,
          total_accounts: accountCount[0].count,
          total_addresses: addressCount[0].count,
          total_preferences: prefCount[0].count,
          total_profiles: profileCount[0].count
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ FULL database import failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import full database',
      message: error.message
    });
  }
}));

// =============================================================================
// SEARCH ENDPOINTS (MUST BE BEFORE /users/:id)
// =============================================================================

// GET /api/users/search - Search users by various criteria
router.get('/users/search', checkDbConnection, asyncHandler(async (req, res) => {
  console.log('Search endpoint called with query:', req.query);
  
  const { q, status, role, subscription, city, province } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  try {
    // Build the main query
    let query = `
      SELECT u.*, ua.status, ua.role, ua.subscription, uad.city, uad.province 
      FROM users u 
      LEFT JOIN user_accounts ua ON u.id = ua.user_id 
      LEFT JOIN user_addresses uad ON u.id = uad.user_id 
      WHERE 1=1
    `;
    const params = [];
    
    if (q) {
      query += ` AND (u.username LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`;
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (status) {
      query += ` AND ua.status = ?`;
      params.push(status);
    }
    
    if (role) {
      query += ` AND ua.role = ?`;
      params.push(role);
    }
    
    if (subscription) {
      query += ` AND ua.subscription = ?`;
      params.push(subscription);
    }
    
    if (city) {
      query += ` AND uad.city = ?`;
      params.push(city);
    }
    
    if (province) {
      query += ` AND uad.province = ?`;
      params.push(province);
    }
    
    // Get total count for proper pagination
    let countQuery = query.replace(/SELECT u\.\*, ua\.status, ua\.role, ua\.subscription, uad\.city, uad\.province/, 'SELECT COUNT(DISTINCT u.id) as total');
    const countParams = [...params]; // Copy params for count query
    
    const [totalResult] = await pool.execute(countQuery, countParams);
    const total = totalResult[0].total;
    
    // Add pagination to main query
    query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    console.log('Executing query:', query);
    console.log('With params:', params);
    
    const [users] = await pool.execute(query, params);
    
    console.log('Found users:', users.length);
    
    res.json({
      data: users,
      pagination: {
        page,
        limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      },
      debug: {
        query_params: req.query,
        total_found: users.length,
        total_in_db: total
      }
    });
    
  } catch (error) {
    console.error('Search endpoint error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
      debug: req.query
    });
  }
}));

// GET /api/users/search/email/:email - Search user by email
router.get('/users/search/email/:email', checkDbConnection, asyncHandler(async (req, res) => {
  const email = req.params.email;
  console.log('Email search for:', email);
  
  try {
    const [users] = await pool.execute(
      `SELECT u.*, ua.status, ua.role, ua.subscription 
       FROM users u 
       LEFT JOIN user_accounts ua ON u.id = ua.user_id 
       WHERE u.email = ?`,
      [email]
    );
    
    if (users.length === 0) {
      // Get some sample emails for debugging
      const [sampleEmails] = await pool.execute('SELECT email FROM users LIMIT 5');
      
      return res.status(404).json({ 
        error: 'User not found',
        searched_email: email,
        available_emails: sampleEmails.map(u => u.email),
        suggestion: 'Try one of the available emails above'
      });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('Email search error:', error);
    res.status(500).json({
      error: 'Email search failed',
      message: error.message
    });
  }
}));

// =============================================================================
// STATISTICS ENDPOINTS (before other /users routes)
// =============================================================================

// GET /api/stats/users - Get user statistics
router.get('/stats/users', checkDbConnection, asyncHandler(async (req, res) => {
  try {
    const [totalUsers] = await pool.execute('SELECT COUNT(*) as total FROM users');
    const [activeUsers] = await pool.execute('SELECT COUNT(*) as active FROM user_accounts WHERE status = "active"');
    const [usersByRole] = await pool.execute('SELECT role, COUNT(*) as count FROM user_accounts GROUP BY role');
    const [usersBySubscription] = await pool.execute('SELECT subscription, COUNT(*) as count FROM user_accounts GROUP BY subscription');
    const [usersByGender] = await pool.execute('SELECT gender, COUNT(*) as count FROM users WHERE gender IS NOT NULL GROUP BY gender');
    
    res.json({
      total_users: totalUsers[0].total,
      active_users: activeUsers[0].active,
      by_role: usersByRole,
      by_subscription: usersBySubscription,
      by_gender: usersByGender
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({
      error: 'Stats failed',
      message: error.message
    });
  }
}));

// =============================================================================
// BULK OPERATIONS (before other /users routes)
// =============================================================================

// POST /api/users/bulk - Create multiple users
router.post('/users/bulk', checkDbConnection, asyncHandler(async (req, res) => {
  const { users } = req.body;
  
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Users array is required' });
  }
  
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  try {
    const createdUsers = [];
    
    for (const userData of users) {
      const { username, email, first_name, last_name } = userData;
      
      if (!username || !email) {
        throw new Error(`Username and email are required for user: ${JSON.stringify(userData)}`);
      }
      
      // Generate unique random ID
      let userId;
      let attempts = 0;
      const maxAttempts = 10;
      
      do {
        userId = generateRandomId();
        attempts++;
        
        if (attempts > maxAttempts) {
          throw new Error('Failed to generate unique ID after multiple attempts');
        }
      } while (await isIdExists(connection, userId));
      
      // Insert user
      await connection.execute(
        `INSERT INTO users (id, username, email, first_name, last_name, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [userId, username, email, first_name, last_name]
      );
      
      createdUsers.push({ id: userId, username, email, first_name, last_name });
    }
    
    await connection.commit();
    res.status(201).json({ 
      message: `${createdUsers.length} users created successfully`, 
      data: createdUsers 
    });
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// DELETE /api/users/bulk - Delete multiple users
router.delete('/users/bulk', checkDbConnection, asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'UserIds array is required' });
  }
  
  const placeholders = userIds.map(() => '?').join(',');
  const [result] = await pool.execute(
    `DELETE FROM users WHERE id IN (${placeholders})`, 
    userIds
  );
  
  res.json({ 
    message: `${result.affectedRows} users deleted successfully`,
    deleted_count: result.affectedRows
  });
}));

// =============================================================================
// MAIN USER CRUD ENDPOINTS
// =============================================================================

// GET /api/users - Get all users with pagination
router.get('/users', checkDbConnection, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  try {
    const [users] = await pool.execute(
      `SELECT u.*, ua.status, ua.role, ua.subscription 
       FROM users u 
       LEFT JOIN user_accounts ua ON u.id = ua.user_id 
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    const [totalCount] = await pool.execute('SELECT COUNT(*) as count FROM users');
    
    res.json({
      data: users,
      pagination: {
        page,
        limit,
        total: totalCount[0].count,
        totalPages: Math.ceil(totalCount[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: error.message
    });
  }
}));

// POST /api/users - Create new user
router.post('/users', checkDbConnection, asyncHandler(async (req, res) => {
  const {
    username, email, first_name, last_name, phone, date_of_birth, gender,
    account, address, preferences, profile
  } = req.body;
  
  // Validate required fields
  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required' });
  }
  
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  try {
    // Generate unique random ID
    let userId;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      userId = generateRandomId();
      attempts++;
      
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique ID after multiple attempts');
      }
    } while (await isIdExists(connection, userId));
    
    // Insert user
    await connection.execute(
      `INSERT INTO users (id, username, email, first_name, last_name, phone, date_of_birth, gender, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [userId, username, email, first_name, last_name, phone, date_of_birth, gender]
    );
    
    // Insert related data if provided
    if (account) {
      await connection.execute(
        'INSERT INTO user_accounts (user_id, status, role, subscription) VALUES (?, ?, ?, ?)',
        [userId, account.status || 'active', account.role || 'user', account.subscription || 'free']
      );
    }
    
    if (address) {
      await connection.execute(
        'INSERT INTO user_addresses (user_id, street, city, province, postal_code, country) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, address.street, address.city, address.province, address.postal_code, address.country]
      );
    }
    
    if (preferences) {
      await connection.execute(
        'INSERT INTO user_preferences (user_id, language, timezone, notify_email, notify_sms, notify_push) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, preferences.language || 'en', preferences.timezone || 'Asia/Jakarta', 
         preferences.notify_email || 1, preferences.notify_sms || 0, preferences.notify_push || 1]
      );
    }
    
    if (profile) {
      await connection.execute(
        'INSERT INTO user_profiles (user_id, avatar, bio, website, instagram, linkedin) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, profile.avatar, profile.bio, profile.website, profile.instagram, profile.linkedin]
      );
    }
    
    await connection.commit();
    
    // Return created user
    const [newUser] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    res.status(201).json({ 
      message: 'User created successfully', 
      data: newUser[0], 
      generated_id: userId 
    });
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// GET /api/users/:id - Get user by ID (MUST be after search routes)
router.get('/users/:id', checkDbConnection, asyncHandler(async (req, res) => {
  const userId = req.params.id;
  
  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const [accounts] = await pool.execute('SELECT * FROM user_accounts WHERE user_id = ?', [userId]);
    const [addresses] = await pool.execute('SELECT * FROM user_addresses WHERE user_id = ?', [userId]);
    const [preferences] = await pool.execute('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
    const [profiles] = await pool.execute('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
    
    const userData = {
      ...users[0],
      account: accounts[0] || null,
      address: addresses[0] || null,
      preferences: preferences[0] || null,
      profile: profiles[0] || null
    };
    
    res.json(userData);
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error.message
    });
  }
}));

// PATCH /api/users/:id - Partial update user
router.patch('/users/:id', checkDbConnection, asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const updates = req.body;
  
  // Check if user exists
  const [existingUser] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
  if (existingUser.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const fields = [];
  const values = [];
  
  // Build dynamic update query
  Object.keys(updates).forEach(key => {
    if (['username', 'email', 'first_name', 'last_name', 'phone', 'date_of_birth', 'gender'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  });
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  
  fields.push('updated_at = NOW()');
  values.push(userId);
  
  await pool.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  
  res.json({ message: 'User updated successfully' });
}));

// DELETE /api/users/:id - Delete user
router.delete('/users/:id', checkDbConnection, asyncHandler(async (req, res) => {
  const userId = req.params.id;
  
  const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({ message: 'User deleted successfully' });
}));

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Router error:', error);
  
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry. Username or email already exists.' });
  }
  
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Invalid user ID. User does not exist.' });
  }
  
  if (error.code === 'ECONNREFUSED') {
    return res.status(500).json({ error: 'Database connection failed' });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message,
    code: error.code
  });
});

module.exports = router;