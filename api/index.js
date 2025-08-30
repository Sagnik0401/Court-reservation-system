// api/index.js - Vercel Serverless Function Wrapper
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

console.log('🎾 Starting Tennis Court Reservation System...');

// Initialize Supabase client with better error handling
let supabase;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  console.log('✅ Supabase client initialized');
} catch (error) {
  console.error('❌ Failed to initialize Supabase:', error.message);
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Enhanced CORS middleware for deployment
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://your-deployment-domain.vercel.app', // Replace with your actual Vercel domain
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check and API status
app.get('/api/health', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Database connection not initialized');
    }
    
    // Test database connection
    const { data, error } = await supabase
      .from('members')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: "Tennis Court System - Healthy",
      timestamp: new Date().toISOString(),
      status: "operational",
      database: "connected",
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      success: false,
      message: "Service unavailable",
      timestamp: new Date().toISOString(),
      status: "error",
      database: "disconnected",
      error: error.message
    });
  }
});

// Basic server test (keeping for backward compatibility)
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: "Tennis Court System - Ready!",
    timestamp: new Date().toISOString(),
    status: "operational"
  });
});

// Enhanced login endpoint with better validation and security
app.post('/api/login', async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Database connection not available');
    }
    
    const { email, password } = req.body;
    
    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and membership number are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credential format',
        code: 'INVALID_FORMAT'
      });
    }

    // Sanitize email
    const cleanEmail = email.toLowerCase().trim();
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    const { data: member, error } = await supabase
      .from('members')
      .select('id, membership_no, email_id, first_name, last_name, role, created_at')
      .eq('email_id', cleanEmail)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }
      throw error;
    }

    // Verify password (membership number)
    if (password !== member.membership_no) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    console.log(`✅ Login successful for member: ${member.membership_no}`);

    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: member.id,
        membershipId: member.membership_no,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email_id,
        role: member.role,
        joinDate: member.created_at
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login',
      code: 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
  // In a real app, you'd verify JWT or session here
  // For now, we'll skip this check but log the attempt
  console.log('⚠️  Admin endpoint accessed - implement proper auth in production');
  next();
};

// Get all members with enhanced error handling
app.get('/api/members', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      throw new Error('Database connection not available');
    }
    
    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedMembers = members.map(member => ({
      id: member.id,
      membershipId: member.membership_no,
      name: `${member.first_name} ${member.last_name}`,
      email: member.email_id,
      role: member.role,
      createdAt: member.created_at
    }));

    console.log(`✅ Retrieved ${formattedMembers.length} members`);

    res.json({
      success: true,
      members: formattedMembers,
      total: formattedMembers.length
    });
  } catch (error) {
    console.error('❌ Error getting members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve members',
      code: 'DATABASE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add all your other routes here...
// For brevity, I'm including just the essential ones. 
// You'll need to copy all the routes from your server.js

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Error:', err);
  
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
    
  res.status(500).json({
    success: false,
    message: errorMessage,
    code: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.warn(`⚠️  404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;