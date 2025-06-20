// src/routes/users.js
const express = require('express');
const { pool } = require('../config/database');
const router = express.Router();
const crypto = require('crypto');

// Function untuk generate random ID
function generateRandomId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// Function untuk check apakah ID sudah ada
async function isIdExists(connection, id) {
  const [existing] = await connection.execute('SELECT id FROM users WHERE id = ?', [id]);
  return existing.length > 0;
}

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =============================================================================
// DEBUG ENDPOINTS (for troubleshooting)
// =============================================================================

// Simple test route
router.get('/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Debug database connection
router.get('/debug/db-test', asyncHandler(async (req, res) => {
  try {
    const [result] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [sampleUsers] = await pool.execute('SELECT id, username, email, first_name FROM users LIMIT 3');
    
    res.json({
      database_connected: true,
      total_users: result[0].count,
      sample_users: sampleUsers,
      message: "Database connection OK"
    });
  } catch (error) {
    res.status(500).json({
      database_connected: false,
      error: error.message,
      error_code: error.code
    });
  }
}));

// =============================================================================
// SEARCH ENDPOINTS (MUST BE BEFORE /users/:id)
// =============================================================================

// GET /api/users/search - Search users by various criteria
router.get('/users/search', asyncHandler(async (req, res) => {
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
router.get('/users/search/email/:email', asyncHandler(async (req, res) => {
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
router.get('/stats/users', asyncHandler(async (req, res) => {
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
router.post('/users/bulk', asyncHandler(async (req, res) => {
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
router.delete('/users/bulk', asyncHandler(async (req, res) => {
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

// GET /api/users - Get all users with pagination (ROBUST VERSION)
router.get('/users', asyncHandler(async (req, res) => {
  // Parse and validate pagination parameters
  let page = 1;
  let limit = 10;
  
  // Safely parse page
  if (req.query.page) {
    const parsedPage = parseInt(req.query.page, 10);
    if (!isNaN(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }
  }
  
  // Safely parse limit
  if (req.query.limit) {
    const parsedLimit = parseInt(req.query.limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
      limit = parsedLimit;
    }
  }
  
  const offset = (page - 1) * limit;
  
  // Ensure all parameters are integers
  const safeLimit = parseInt(limit, 10);
  const safeOffset = parseInt(offset, 10);
  
  console.log('Pagination debug:', { 
    originalPage: req.query.page, 
    originalLimit: req.query.limit, 
    finalPage: page, 
    finalLimit: safeLimit, 
    finalOffset: safeOffset 
  });
  
  try {
    // Execute query with properly typed parameters
    const [users] = await pool.execute(
      `SELECT u.*, ua.status, ua.role, ua.subscription 
       FROM users u 
       LEFT JOIN user_accounts ua ON u.id = ua.user_id 
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [safeLimit, safeOffset]
    );
    
    const [totalCount] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const total = totalCount[0].count;
    
    res.json({
      data: users,
      pagination: {
        page: page,
        limit: safeLimit,
        total: total,
        totalPages: Math.ceil(total / safeLimit),
        hasNext: (page * safeLimit) < total,
        hasPrev: page > 1
      },
      meta: {
        count: users.length,
        query_params: {
          page: req.query.page,
          limit: req.query.limit
        }
      }
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    console.error('Query parameters:', {
      safeLimit,
      safeOffset,
      types: {
        safeLimit: typeof safeLimit,
        safeOffset: typeof safeOffset
      }
    });
    
    res.status(500).json({
      error: 'Failed to get users',
      message: error.message
    });
  }
}));

// POST /api/users - Create new user
router.post('/users', asyncHandler(async (req, res) => {
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
router.get('/users/:id', asyncHandler(async (req, res) => {
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
router.patch('/users/:id', asyncHandler(async (req, res) => {
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
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  
  const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({ message: 'User deleted successfully' });
}));

// =============================================================================
// RELATED DATA ENDPOINTS
// =============================================================================

// User Accounts
router.get('/users/:id/account', asyncHandler(async (req, res) => {
  const [account] = await pool.execute('SELECT * FROM user_accounts WHERE user_id = ?', [req.params.id]);
  
  if (account.length === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  res.json(account[0]);
}));

router.post('/users/:id/account', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { status, role, subscription } = req.body;
  
  await pool.execute(
    'INSERT INTO user_accounts (user_id, status, role, subscription) VALUES (?, ?, ?, ?)',
    [userId, status || 'active', role || 'user', subscription || 'free']
  );
  
  res.status(201).json({ message: 'Account created successfully' });
}));

router.put('/users/:id/account', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { status, role, subscription } = req.body;
  
  const [result] = await pool.execute(
    'UPDATE user_accounts SET status = ?, role = ?, subscription = ? WHERE user_id = ?',
    [status, role, subscription, userId]
  );
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  res.json({ message: 'Account updated successfully' });
}));

router.delete('/users/:id/account', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM user_accounts WHERE user_id = ?', [req.params.id]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  res.json({ message: 'Account deleted successfully' });
}));

// User Addresses
router.get('/users/:id/address', asyncHandler(async (req, res) => {
  const [address] = await pool.execute('SELECT * FROM user_addresses WHERE user_id = ?', [req.params.id]);
  
  if (address.length === 0) {
    return res.status(404).json({ error: 'Address not found' });
  }
  
  res.json(address[0]);
}));

router.post('/users/:id/address', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { street, city, province, postal_code, country } = req.body;
  
  await pool.execute(
    'INSERT INTO user_addresses (user_id, street, city, province, postal_code, country) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, street, city, province, postal_code, country]
  );
  
  res.status(201).json({ message: 'Address created successfully' });
}));

router.put('/users/:id/address', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { street, city, province, postal_code, country } = req.body;
  
  const [result] = await pool.execute(
    'UPDATE user_addresses SET street = ?, city = ?, province = ?, postal_code = ?, country = ? WHERE user_id = ?',
    [street, city, province, postal_code, country, userId]
  );
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Address not found' });
  }
  
  res.json({ message: 'Address updated successfully' });
}));

router.delete('/users/:id/address', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM user_addresses WHERE user_id = ?', [req.params.id]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Address not found' });
  }
  
  res.json({ message: 'Address deleted successfully' });
}));

// User Preferences
router.get('/users/:id/preferences', asyncHandler(async (req, res) => {
  const [preferences] = await pool.execute('SELECT * FROM user_preferences WHERE user_id = ?', [req.params.id]);
  
  if (preferences.length === 0) {
    return res.status(404).json({ error: 'Preferences not found' });
  }
  
  res.json(preferences[0]);
}));

router.post('/users/:id/preferences', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { language, timezone, notify_email, notify_sms, notify_push } = req.body;
  
  await pool.execute(
    'INSERT INTO user_preferences (user_id, language, timezone, notify_email, notify_sms, notify_push) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, language || 'en', timezone || 'Asia/Jakarta', notify_email || 1, notify_sms || 0, notify_push || 1]
  );
  
  res.status(201).json({ message: 'Preferences created successfully' });
}));

router.put('/users/:id/preferences', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { language, timezone, notify_email, notify_sms, notify_push } = req.body;
  
  const [result] = await pool.execute(
    'UPDATE user_preferences SET language = ?, timezone = ?, notify_email = ?, notify_sms = ?, notify_push = ? WHERE user_id = ?',
    [language, timezone, notify_email, notify_sms, notify_push, userId]
  );
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Preferences not found' });
  }
  
  res.json({ message: 'Preferences updated successfully' });
}));

router.delete('/users/:id/preferences', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM user_preferences WHERE user_id = ?', [req.params.id]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Preferences not found' });
  }
  
  res.json({ message: 'Preferences deleted successfully' });
}));

// User Profiles
router.get('/users/:id/profile', asyncHandler(async (req, res) => {
  const [profile] = await pool.execute('SELECT * FROM user_profiles WHERE user_id = ?', [req.params.id]);
  
  if (profile.length === 0) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  res.json(profile[0]);
}));

router.post('/users/:id/profile', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { avatar, bio, website, instagram, linkedin } = req.body;
  
  await pool.execute(
    'INSERT INTO user_profiles (user_id, avatar, bio, website, instagram, linkedin) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, avatar, bio, website, instagram, linkedin]
  );
  
  res.status(201).json({ message: 'Profile created successfully' });
}));

router.put('/users/:id/profile', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { avatar, bio, website, instagram, linkedin } = req.body;
  
  const [result] = await pool.execute(
    'UPDATE user_profiles SET avatar = ?, bio = ?, website = ?, instagram = ?, linkedin = ? WHERE user_id = ?',
    [avatar, bio, website, instagram, linkedin, userId]
  );
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  res.json({ message: 'Profile updated successfully' });
}));

router.delete('/users/:id/profile', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM user_profiles WHERE user_id = ?', [req.params.id]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  res.json({ message: 'Profile deleted successfully' });
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
