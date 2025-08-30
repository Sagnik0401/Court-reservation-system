const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
  process.exit(1);
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Enhanced CORS middleware for deployment
// Updated CORS middleware for Vercel deployment
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  
  // Allow all origins for now (you can restrict later)
  res.header('Access-Control-Allow-Origin', origin || '*');
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
      database: "disconnected"
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
      code: 'SERVER_ERROR'
    });
  }
});

// =========================
// ADMIN ENDPOINTS
// =========================

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
      code: 'DATABASE_ERROR'
    });
  }
});

// Enhanced member registration with validation
app.post('/api/register', async (req, res) => {
  try {
    const { membershipId, firstName, lastName, email, role = 'member' } = req.body;

    // Comprehensive validation
    if (!membershipId || !firstName || !lastName || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required (membershipId, firstName, lastName, email)',
        code: 'MISSING_FIELDS'
      });
    }

    // Validate field types and formats
    if (typeof membershipId !== 'string' || membershipId.trim().length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'Membership ID must be at least 3 characters',
        code: 'INVALID_MEMBERSHIP_ID'
      });
    }

    if (typeof firstName !== 'string' || firstName.trim().length < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'First name is required',
        code: 'INVALID_FIRST_NAME'
      });
    }

    if (typeof lastName !== 'string' || lastName.trim().length < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Last name is required',
        code: 'INVALID_LAST_NAME'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role must be either "member" or "admin"',
        code: 'INVALID_ROLE'
      });
    }

    const { data: newMember, error } = await supabase
      .from('members')
      .insert([{
        membership_no: membershipId.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email_id: cleanEmail,
        role: role
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Determine which constraint failed
        const isDuplicateEmail = error.details?.includes('email_id');
        const message = isDuplicateEmail ? 'Email already exists' : 'Membership ID already exists';
        return res.status(409).json({ 
          success: false, 
          message,
          code: isDuplicateEmail ? 'DUPLICATE_EMAIL' : 'DUPLICATE_MEMBERSHIP_ID'
        });
      }
      throw error;
    }

    console.log(`✅ Member registered: ${newMember.membership_no}`);

    res.status(201).json({
      success: true,
      message: 'Member added successfully!',
      member: {
        id: newMember.id,
        membershipId: newMember.membership_no,
        name: `${newMember.first_name} ${newMember.last_name}`,
        email: newMember.email_id,
        role: newMember.role,
        createdAt: newMember.created_at
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration',
      code: 'SERVER_ERROR'
    });
  }
});

// Enhanced get all bookings with better filtering and error handling
app.post('/api/bookings/all', requireAdmin, async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        courts (name, surface_type),
        members (first_name, last_name, membership_no),
        coachings (group_name, coach_name)
      `)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) throw error;

    const formattedBookings = bookings
      .filter(booking => {
        // More robust filtering
        const hasValidCourt = booking.courts && booking.courts.name;
        const hasValidMemberOrCoaching = 
          (booking.members && booking.members.first_name) || 
          (booking.coachings && booking.coachings.group_name);
        
        if (!hasValidCourt || !hasValidMemberOrCoaching) {
          console.warn(`⚠️  Invalid booking found: ${booking.id}`);
          return false;
        }
        return true;
      })
      .map(booking => {
        const startTime = booking.start_time;
        const [hours, minutes] = startTime.split(':').map(Number);
        const startMinutes = hours * 60 + minutes;
        const endMinutes = startMinutes + booking.duration_minutes;
        const endHours = Math.floor(endMinutes / 60);
        const endMins = endMinutes % 60;
        const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

        let memberName, membershipId;
        
        if (booking.members) {
          memberName = `${booking.members.first_name} ${booking.members.last_name}`;
          membershipId = booking.members.membership_no;
        } else if (booking.coachings) {
          memberName = `${booking.coachings.group_name} (${booking.coachings.coach_name})`;
          membershipId = 'COACHING';
        }

        return {
          id: booking.id,
          userId: booking.member_id,
          membershipId,
          memberName,
          courtId: booking.court_id,
          courtName: booking.courts.name,
          date: booking.booking_date,
          startTime: booking.start_time,
          endTime,
          duration: booking.duration_minutes,
          status: booking.status,
          notes: booking.notes,
          createdAt: booking.created_at,
          bookingType: booking.booking_type || 'member'
        };
      });

    console.log(`✅ Retrieved ${formattedBookings.length} valid bookings`);

    res.json({
      success: true,
      bookings: formattedBookings,
      total: formattedBookings.length
    });
  } catch (error) {
    console.error('❌ Error getting all bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bookings',
      code: 'DATABASE_ERROR'
    });
  }
});

// Update court status (Admin only)
app.put('/api/courts/:courtId', async (req, res) => {
  const { courtId } = req.params;
  const { isActive } = req.body;

  try {
    const { data: court, error } = await supabase
      .from('courts')
      .update({ is_active: isActive })
      .eq('id', parseInt(courtId))
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Court ${courtId} status updated:`, isActive);

    res.json({
      success: true,
      message: `Court ${courtId} ${isActive ? 'activated' : 'deactivated'} successfully`,
      court: {
        id: court.id,
        name: court.name,
        surfaceType: court.surface_type,
        isActive: court.is_active
      }
    });
  } catch (error) {
    console.error('❌ Error updating court status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating court status'
    });
  }
});

// Delete member (Admin only)
app.delete('/api/members/:memberId', async (req, res) => {
  const { memberId } = req.params;

  try {
    // First, check if member has active bookings
    const { data: activeBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('member_id', parseInt(memberId))
      .eq('status', 'confirmed');

    if (bookingError) throw bookingError;

    if (activeBookings && activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete member with active bookings. Please cancel or complete their bookings first.'
      });
    }

    // Delete the member
    const { error: deleteError } = await supabase
      .from('members')
      .delete()
      .eq('id', parseInt(memberId));

    if (deleteError) throw deleteError;

    console.log(`✅ Member ${memberId} deleted successfully`);

    res.json({
      success: true,
      message: 'Member deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting member:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting member'
    });
  }
});

// =========================
// EXISTING CLIENT ENDPOINTS
// =========================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Get all courts
app.get('/api/courts', async (req, res) => {
  try {
    const { data: courts, error } = await supabase
      .from('courts')
      .select('*')
      .eq('is_active', true)
      .order('id');

    if (error) throw error;

    res.json({
      success: true,
      courts: courts
    });
  } catch (error) {
    console.error('❌ Error getting courts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Create new booking
app.post('/api/bookings', async (req, res) => {
  const { courtId, date, startTime, duration, notes, userId } = req.body;

  if (!courtId || !date || !startTime || !duration || !userId) {
    return res.status(400).json({ success: false, message: 'All required fields must be provided' });
  }

  if (![30, 60, 90, 120].includes(parseInt(duration))) {
    return res.status(400).json({ success: false, message: 'Invalid duration' });
  }

  try {
    const { data: conflictCheck, error: conflictError } = await supabase
      .rpc('check_booking_conflict', {
        p_court_id: parseInt(courtId),
        p_booking_date: date,
        p_start_time: startTime,
        p_duration_minutes: parseInt(duration)
      });

    if (conflictError) throw conflictError;

    if (conflictCheck) {
      return res.status(409).json({ success: false, message: 'Time slot already booked' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert([{
        court_id: parseInt(courtId),
        member_id: parseInt(userId),
        booking_date: date,
        start_time: startTime,
        duration_minutes: parseInt(duration),
        status: 'confirmed',
        notes: notes || null
      }])
      .select(`*, courts (name), members (first_name, last_name)`)
      .single();

    if (bookingError) throw bookingError;

    res.json({
      success: true,
      message: 'Court booked successfully!',
      booking: {
        id: booking.id,
        courtId: booking.court_id,
        courtName: booking.courts.name,
        date: booking.booking_date,
        startTime: booking.start_time,
        duration: booking.duration_minutes,
        status: booking.status,
        notes: booking.notes,
        memberName: `${booking.members.first_name} ${booking.members.last_name}`,
        createdAt: booking.created_at
      }
    });
  } catch (error) {
    console.error('❌ Booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get bookings for a specific user
app.get('/api/bookings/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        courts (name, surface_type)
      `)
      .eq('member_id', parseInt(userId))
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) throw error;

    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      courtId: booking.court_id,
      courtName: booking.courts.name,
      date: booking.booking_date,
      startTime: booking.start_time,
      duration: booking.duration_minutes,
      status: booking.status,
      notes: booking.notes,
      createdAt: booking.created_at
    }));

    res.json({
      success: true,
      bookings: formattedBookings
    });
  } catch (error) {
    console.error('❌ Error getting user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get availability for a specific court and date
app.get('/api/bookings/availability', async (req, res) => {
  const { court, date } = req.query;

  if (!court || !date) {
    return res.status(400).json({
      success: false,
      message: 'Court ID and date are required'
    });
  }

  try {
    const { data: availability, error } = await supabase
      .rpc('get_available_slots', {
        p_court_id: parseInt(court),
        p_booking_date: date
      });

    if (error) throw error;

    const formattedAvailability = availability.map(slot => ({
      time: slot.slot_time,
      status: slot.is_available ? 'available' : 'booked',
      bookingId: slot.booking_id
    }));

    res.json({
      success: true,
      availability: formattedAvailability
    });
  } catch (error) {
    console.error('❌ Error checking availability:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Cancel a booking
app.delete('/api/bookings/:bookingId', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*, members(id)')
      .eq('id', parseInt(bookingId))
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      throw fetchError;
    }

    const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`);
    const now = new Date();
    const hourBeforeBooking = new Date(bookingDateTime.getTime() - 60 * 60 * 1000);

    if (now >= hourBeforeBooking) {
      return res.status(400).json({
        success: false,
        message: 'Bookings can only be cancelled at least 1 hour before the start time'
      });
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', parseInt(bookingId))
      .select()
      .single();

    if (updateError) throw updateError;

    console.log('✅ Booking cancelled:', bookingId);

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling booking'
    });
  }
});

// Update member (Admin only)
app.put('/api/members/:memberId', async (req, res) => {
  const { memberId } = req.params;
  const { membershipId, firstName, lastName, email, role } = req.body;

  if (!membershipId || !firstName || !lastName || !email) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  try {
    // Check if membership ID already exists (exclude current member)
    const { data: existingMember, error: checkError } = await supabase
      .from('members')
      .select('id')
      .eq('membership_no', membershipId)
      .neq('id', parseInt(memberId))
      .single();

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'Membership ID already exists'
      });
    }

    // Check if email already exists (exclude current member)
    const { data: existingEmail, error: emailCheckError } = await supabase
      .from('members')
      .select('id')
      .eq('email_id', email.toLowerCase())
      .neq('id', parseInt(memberId))
      .single();

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Update member
    const { data: updatedMember, error: updateError } = await supabase
      .from('members')
      .update({
        membership_no: membershipId,
        first_name: firstName,
        last_name: lastName,
        email_id: email.toLowerCase(),
        role: role
      })
      .eq('id', parseInt(memberId))
      .select()
      .single();

    if (updateError) throw updateError;

    console.log('✅ Member updated:', updatedMember.id);

    res.json({
      success: true,
      message: 'Member updated successfully!',
      member: {
        id: updatedMember.id,
        membershipId: updatedMember.membership_no,
        name: `${updatedMember.first_name} ${updatedMember.last_name}`,
        email: updatedMember.email_id,
        role: updatedMember.role,
        createdAt: updatedMember.created_at
      }
    });
  } catch (error) {
    console.error('❌ Update member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating member'
    });
  }
});

// Update booking (Admin only)
app.put('/api/bookings/:bookingId', async (req, res) => {
  const { bookingId } = req.params;
  const { courtId, date, startTime, duration, notes } = req.body;

  if (!courtId || !date || !startTime || !duration) {
    return res.status(400).json({
      success: false,
      message: 'Court, date, start time, and duration are required'
    });
  }

  if (![30, 60, 90, 120].includes(parseInt(duration))) {
    return res.status(400).json({
      success: false,
      message: 'Duration must be 30, 60, 90, or 120 minutes'
    });
  }

  try {
    // Check for conflicts (excluding current booking)
    const { data: conflictCheck, error: conflictError } = await supabase
      .rpc('check_booking_conflict', {
        p_court_id: parseInt(courtId),
        p_booking_date: date,
        p_start_time: startTime,
        p_duration_minutes: parseInt(duration),
        p_exclude_booking_id: parseInt(bookingId)
      });

    if (conflictError) throw conflictError;

    if (conflictCheck) {
      return res.status(409).json({
        success: false,
        message: 'Time slot already booked. Please choose a different time.'
      });
    }

    // Update booking
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({
        court_id: parseInt(courtId),
        booking_date: date,
        start_time: startTime,
        duration_minutes: parseInt(duration),
        notes: notes || null
      })
      .eq('id', parseInt(bookingId))
      .select(`
        *,
        courts (name, surface_type),
        members (first_name, last_name, membership_no)
      `)
      .single();

    if (updateError) throw updateError;

    console.log('✅ Booking updated:', updatedBooking.id);

    res.json({
      success: true,
      message: 'Booking updated successfully!',
      booking: {
        id: updatedBooking.id,
        courtId: updatedBooking.court_id,
        courtName: updatedBooking.courts.name,
        date: updatedBooking.booking_date,
        startTime: updatedBooking.start_time,
        duration: updatedBooking.duration_minutes,
        status: updatedBooking.status,
        notes: updatedBooking.notes,
        memberName: `${updatedBooking.members.first_name} ${updatedBooking.members.last_name}`,
        updatedAt: updatedBooking.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Booking update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating booking'
    });
  }
});

// Complete booking (Admin only)
app.patch('/api/bookings/:bookingId/complete', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'completed' })
      .eq('id', parseInt(bookingId))
      .select()
      .single();

    if (updateError) throw updateError;

    console.log('✅ Booking completed:', bookingId);

    res.json({
      success: true,
      message: 'Booking marked as completed'
    });
  } catch (error) {
    console.error('❌ Error completing booking:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while completing booking'
    });
  }
});

// Check booking conflict endpoint
app.post('/api/bookings/check-conflict', async (req, res) => {
  const { courtId, date, startTime, duration, excludeBookingId } = req.body;

  try {
    const { data: hasConflict, error } = await supabase
      .rpc('check_booking_conflict', {
        p_court_id: parseInt(courtId),
        p_booking_date: date,
        p_start_time: startTime,
        p_duration_minutes: parseInt(duration),
        p_exclude_booking_id: excludeBookingId ? parseInt(excludeBookingId) : null
      });

    if (error) throw error;

    res.json({
      success: true,
      hasConflict: hasConflict
    });
  } catch (error) {
    console.error('❌ Error checking conflict:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking booking conflict'
    });
  }
});

// Get all courts including inactive (Admin only)
app.get('/api/courts/all', async (req, res) => {
  try {
    const { data: courts, error } = await supabase
      .from('courts')
      .select('*')
      .order('id');

    if (error) throw error;

    res.json({
      success: true,
      courts: courts
    });
  } catch (error) {
    console.error('❌ Error getting all courts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Continue from here for the remaining endpoints...

// Get dashboard statistics (Admin only)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get total members with proper error handling
    const { count: totalMembers, error: membersError } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true });
    
    if (membersError) throw membersError;
    
    // Get today's bookings with proper error handling
    const { count: todayBookings, error: todayError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('booking_date', today)
      .eq('status', 'confirmed');
    
    if (todayError) throw todayError;
    
    // Get active courts with proper error handling
    const { count: activeCourts, error: courtsError } = await supabase
      .from('courts')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    
    if (courtsError) throw courtsError;
    
    // Get total bookings with proper error handling
    const { count: totalBookings, error: revenueError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'confirmed');
    
    if (revenueError) throw revenueError;

    res.json({
      success: true,
      stats: {
        totalMembers: totalMembers || 0,
        todayBookings: todayBookings || 0,
        activeCourts: activeCourts || 0,
        totalBookings: totalBookings || 0
      }
    });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving statistics',
      code: 'STATS_ERROR'
    });
  }
});

// Get recent activity (Admin only) - Fixed with better error handling
app.get('/api/admin/recent-activity', async (req, res) => {
  try {
    const { data: recentBookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        start_time,
        status,
        created_at,
        booking_type,
        courts (name),
        members (first_name, last_name, membership_no),
        coachings (group_name, coach_name)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const formattedActivity = (recentBookings || [])
      .filter(booking => {
        // More robust filtering with null checks
        const hasValidCourt = booking.courts && booking.courts.name;
        const hasValidMemberOrCoaching = 
          (booking.members && booking.members.first_name) || 
          (booking.coachings && booking.coachings.group_name);
        
        if (!hasValidCourt || !hasValidMemberOrCoaching) {
          console.warn(`⚠️  Invalid booking found: ${booking.id}`);
          return false;
        }
        return true;
      })
      .slice(0, 10)
      .map(booking => {
        let memberName = 'Unknown Member';
        let membershipId = 'N/A';
        
        if (booking.members) {
          memberName = `${booking.members.first_name} ${booking.members.last_name}`;
          membershipId = booking.members.membership_no;
        } else if (booking.coachings) {
          memberName = `${booking.coachings.group_name}`;
          membershipId = 'COACHING';
        }

        return {
          id: booking.id,
          memberName: memberName,
          membershipId: membershipId,
          courtName: booking.courts.name,
          date: booking.booking_date,
          startTime: booking.start_time,
          status: booking.status,
          createdAt: booking.created_at,
          bookingType: booking.booking_type || 'member'
        };
      });

    res.json({
      success: true,
      activities: formattedActivity
    });
  } catch (error) {
    console.error('❌ Error getting recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving recent activity',
      code: 'ACTIVITY_ERROR'
    });
  }
});

// Clean up orphaned bookings with enhanced error handling
app.post('/api/admin/cleanup-bookings', requireAdmin, async (req, res) => {
  try {
    // Find bookings without valid members or coachings
    const { data: orphanedBookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        member_id,
        coaching_id,
        members!left (id),
        coachings!left (id)
      `);

    if (error) throw error;

    const toDelete = (orphanedBookings || []).filter(booking => 
      !booking.members && !booking.coachings
    );

    if (toDelete.length > 0) {
      const idsToDelete = toDelete.map(b => b.id);
      
      const { error: deleteError } = await supabase
        .from('bookings')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) throw deleteError;

      console.log(`✅ Cleaned up ${toDelete.length} orphaned bookings`);
      
      res.json({
        success: true,
        message: `Cleaned up ${toDelete.length} orphaned bookings`,
        deletedIds: idsToDelete,
        deletedCount: toDelete.length
      });
    } else {
      res.json({
        success: true,
        message: 'No orphaned bookings found',
        deletedCount: 0
      });
    }
  } catch (error) {
    console.error('❌ Error cleaning up bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during cleanup',
      code: 'CLEANUP_ERROR'
    });
  }
});

// Bulk booking operations with enhanced validation
app.post('/api/bookings/bulk', requireAdmin, async (req, res) => {
  const { action, bookingIds } = req.body;

  if (!action || !bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Action and at least one booking ID are required',
      code: 'INVALID_BULK_REQUEST'
    });
  }

  // Validate booking IDs are numbers
  const validIds = bookingIds.filter(id => Number.isInteger(parseInt(id)));
  if (validIds.length !== bookingIds.length) {
    return res.status(400).json({
      success: false,
      message: 'All booking IDs must be valid integers',
      code: 'INVALID_BOOKING_IDS'
    });
  }

  try {
    let updateData = {};
    
    switch (action) {
      case 'cancel':
        updateData = { status: 'cancelled' };
        break;
      case 'complete':
        updateData = { status: 'completed' };
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be "cancel" or "complete"',
          code: 'INVALID_ACTION'
        });
    }

    const { data: updatedBookings, error } = await supabase
      .from('bookings')
      .update(updateData)
      .in('id', validIds)
      .select('id, status');

    if (error) throw error;

    const updatedCount = updatedBookings ? updatedBookings.length : 0;
    console.log(`✅ Bulk ${action} completed for ${updatedCount} bookings`);

    res.json({
      success: true,
      message: `${updatedCount} bookings ${action}ed successfully`,
      updatedCount: updatedCount,
      updatedIds: updatedBookings ? updatedBookings.map(b => b.id) : []
    });
  } catch (error) {
    console.error(`❌ Bulk ${action} error:`, error);
    res.status(500).json({
      success: false,
      message: `Server error during bulk ${action}`,
      code: 'BULK_OPERATION_ERROR'
    });
  }
});

// Get all coaching groups with enhanced error handling
app.get('/api/coachings', async (req, res) => {
  try {
    const { data: coachings, error } = await supabase
      .from('coachings')
      .select('*')
      .eq('is_active', true)
      .order('group_name');

    if (error) throw error;

    const formattedCoachings = (coachings || []).map(coaching => ({
      id: coaching.id,
      groupName: coaching.group_name,
      coachName: coaching.coach_name,
      description: coaching.description,
      maxParticipants: coaching.max_participants,
      isActive: coaching.is_active
    }));

    res.json({
      success: true,
      coachings: formattedCoachings,
      total: formattedCoachings.length
    });
  } catch (error) {
    console.error('❌ Error getting coachings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving coaching groups',
      code: 'COACHINGS_ERROR'
    });
  }
});

// Create admin booking with enhanced validation
app.post('/api/admin/bookings', requireAdmin, async (req, res) => {
  const { courtId, date, startTime, duration, notes, bookingType, userId, coachingId } = req.body;

  // Enhanced validation
  if (!courtId || !date || !startTime || !duration || !bookingType) {
    return res.status(400).json({ 
      success: false, 
      message: 'Court, date, start time, duration, and booking type are required',
      code: 'MISSING_REQUIRED_FIELDS'
    });
  }

  if (!['member', 'coaching'].includes(bookingType)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Booking type must be either "member" or "coaching"',
      code: 'INVALID_BOOKING_TYPE'
    });
  }

  if (bookingType === 'member' && (!userId || !Number.isInteger(parseInt(userId)))) {
    return res.status(400).json({ 
      success: false, 
      message: 'Valid User ID is required for member bookings',
      code: 'INVALID_USER_ID'
    });
  }

  if (bookingType === 'coaching' && (!coachingId || !Number.isInteger(parseInt(coachingId)))) {
    return res.status(400).json({ 
      success: false, 
      message: 'Valid Coaching ID is required for coaching bookings',
      code: 'INVALID_COACHING_ID'
    });
  }

  if (![30, 60, 90, 120].includes(parseInt(duration))) {
    return res.status(400).json({ 
      success: false, 
      message: 'Duration must be 30, 60, 90, or 120 minutes',
      code: 'INVALID_DURATION'
    });
  }

  // Validate date format and ensure it's not in the past
  const bookingDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (isNaN(bookingDate.getTime()) || bookingDate < today) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid date or date is in the past',
      code: 'INVALID_DATE'
    });
  }

  try {
    // Check for conflicts
    const { data: conflictCheck, error: conflictError } = await supabase
      .rpc('check_booking_conflict', {
        p_court_id: parseInt(courtId),
        p_booking_date: date,
        p_start_time: startTime,
        p_duration_minutes: parseInt(duration)
      });

    if (conflictError) throw conflictError;

    if (conflictCheck) {
      return res.status(409).json({ 
        success: false, 
        message: 'Time slot already booked. Please choose a different time.',
        code: 'TIME_SLOT_CONFLICT'
      });
    }

    // Create booking data
    const bookingData = {
      court_id: parseInt(courtId),
      booking_date: date,
      start_time: startTime,
      duration_minutes: parseInt(duration),
      status: 'confirmed',
      notes: notes?.trim() || null,
      booking_type: bookingType
    };

    if (bookingType === 'member') {
      bookingData.member_id = parseInt(userId);
    } else {
      bookingData.coaching_id = parseInt(coachingId);
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert([bookingData])
      .select(`
        *,
        courts (name, surface_type),
        members (first_name, last_name),
        coachings (group_name, coach_name)
      `)
      .single();

    if (bookingError) throw bookingError;

    console.log('✅ Admin booking created:', booking.id);

    let entityName = 'Unknown';
    if (bookingType === 'member' && booking.members) {
      entityName = `${booking.members.first_name} ${booking.members.last_name}`;
    } else if (bookingType === 'coaching' && booking.coachings) {
      entityName = booking.coachings.group_name;
    }

    // Calculate end time
    const startMinutes = booking.start_time.split(':').reduce((acc, time) => (60 * acc) + parseInt(time), 0);
    const endMinutes = startMinutes + booking.duration_minutes;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    res.json({
      success: true,
      message: 'Reservation created successfully!',
      booking: {
        id: booking.id,
        courtId: booking.court_id,
        courtName: booking.courts.name,
        date: booking.booking_date,
        startTime: booking.start_time,
        endTime: endTime,
        duration: booking.duration_minutes,
        status: booking.status,
        bookingType: booking.booking_type,
        entityName: entityName,
        notes: booking.notes,
        createdAt: booking.created_at
      }
    });
  } catch (error) {
    console.error('❌ Admin booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating reservation',
      code: 'BOOKING_CREATION_ERROR'
    });
  }
});

// Get all coaching groups including inactive with enhanced error handling
app.get('/api/coachings/all', requireAdmin, async (req, res) => {
  try {
    const { data: coachings, error } = await supabase
      .from('coachings')
      .select('*')
      .order('group_name');

    if (error) throw error;

    const formattedCoachings = (coachings || []).map(coaching => ({
      id: coaching.id,
      groupName: coaching.group_name,
      coachName: coaching.coach_name,
      description: coaching.description,
      maxParticipants: coaching.max_participants,
      isActive: coaching.is_active,
      createdAt: coaching.created_at
    }));

    res.json({
      success: true,
      coachings: formattedCoachings,
      total: formattedCoachings.length
    });
  } catch (error) {
    console.error('❌ Error getting all coaching groups:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving all coaching groups',
      code: 'ALL_COACHINGS_ERROR'
    });
  }
});

// Create new coaching group with enhanced validation
app.post('/api/coachings', requireAdmin, async (req, res) => {
  const { groupName, coachName, description, maxParticipants } = req.body;

  // Enhanced validation
  if (!groupName?.trim() || !coachName?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Group name and coach name are required and cannot be empty',
      code: 'MISSING_REQUIRED_FIELDS'
    });
  }

  if (groupName.trim().length < 2 || groupName.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Group name must be between 2 and 100 characters',
      code: 'INVALID_GROUP_NAME_LENGTH'
    });
  }

  if (coachName.trim().length < 2 || coachName.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Coach name must be between 2 and 100 characters',
      code: 'INVALID_COACH_NAME_LENGTH'
    });
  }

  const participants = parseInt(maxParticipants);
  if (!Number.isInteger(participants) || participants < 1 || participants > 20) {
    return res.status(400).json({
      success: false,
      message: 'Max participants must be a number between 1 and 20',
      code: 'INVALID_MAX_PARTICIPANTS'
    });
  }

  try {
    const { data: newCoaching, error } = await supabase
      .from('coachings')
      .insert([{
        group_name: groupName.trim(),
        coach_name: coachName.trim(),
        description: description?.trim() || null,
        max_participants: participants
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ 
          success: false, 
          message: 'Coaching group name already exists',
          code: 'DUPLICATE_GROUP_NAME'
        });
      }
      throw error;
    }

    console.log('✅ Coaching group created:', newCoaching.id);

    res.status(201).json({
      success: true,
      message: 'Coaching group created successfully!',
      coaching: {
        id: newCoaching.id,
        groupName: newCoaching.group_name,
        coachName: newCoaching.coach_name,
        description: newCoaching.description,
        maxParticipants: newCoaching.max_participants,
        isActive: newCoaching.is_active,
        createdAt: newCoaching.created_at
      }
    });
  } catch (error) {
    console.error('❌ Error creating coaching group:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating coaching group',
      code: 'COACHING_CREATION_ERROR'
    });
  }
});

// Update coaching group with enhanced validation
app.put('/api/coachings/:coachingId', requireAdmin, async (req, res) => {
  const { coachingId } = req.params;
  const { groupName, coachName, description, maxParticipants } = req.body;

  // Validate coaching ID
  if (!Number.isInteger(parseInt(coachingId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid coaching ID',
      code: 'INVALID_COACHING_ID'
    });
  }

  // Enhanced validation
  if (!groupName?.trim() || !coachName?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Group name and coach name are required and cannot be empty',
      code: 'MISSING_REQUIRED_FIELDS'
    });
  }

  if (groupName.trim().length < 2 || groupName.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Group name must be between 2 and 100 characters',
      code: 'INVALID_GROUP_NAME_LENGTH'
    });
  }

  if (coachName.trim().length < 2 || coachName.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Coach name must be between 2 and 100 characters',
      code: 'INVALID_COACH_NAME_LENGTH'
    });
  }

  const participants = parseInt(maxParticipants);
  if (!Number.isInteger(participants) || participants < 1 || participants > 20) {
    return res.status(400).json({
      success: false,
      message: 'Max participants must be a number between 1 and 20',
      code: 'INVALID_MAX_PARTICIPANTS'
    });
  }

  try {
    // Check if group name already exists (exclude current group)
    const { data: existingGroup, error: checkError } = await supabase
      .from('coachings')
      .select('id')
      .eq('group_name', groupName.trim())
      .neq('id', parseInt(coachingId))
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingGroup) {
      return res.status(409).json({
        success: false,
        message: 'Coaching group name already exists',
        code: 'DUPLICATE_GROUP_NAME'
      });
    }

    // Update coaching group
    const { data: updatedCoaching, error: updateError } = await supabase
      .from('coachings')
      .update({
        group_name: groupName.trim(),
        coach_name: coachName.trim(),
        description: description?.trim() || null,
        max_participants: participants,
        updated_at: new Date().toISOString()
      })
      .eq('id', parseInt(coachingId))
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Coaching group not found',
          code: 'COACHING_NOT_FOUND'
        });
      }
      throw updateError;
    }

    console.log('✅ Coaching group updated:', updatedCoaching.id);

    res.json({
      success: true,
      message: 'Coaching group updated successfully!',
      coaching: {
        id: updatedCoaching.id,
        groupName: updatedCoaching.group_name,
        coachName: updatedCoaching.coach_name,
        description: updatedCoaching.description,
        maxParticipants: updatedCoaching.max_participants,
        isActive: updatedCoaching.is_active,
        updatedAt: updatedCoaching.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Update coaching group error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating coaching group',
      code: 'COACHING_UPDATE_ERROR'
    });
  }
});

// Update coaching group status with validation
app.put('/api/coachings/:coachingId/status', requireAdmin, async (req, res) => {
  const { coachingId } = req.params;
  const { isActive } = req.body;

  // Validate coaching ID
  if (!Number.isInteger(parseInt(coachingId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid coaching ID',
      code: 'INVALID_COACHING_ID'
    });
  }

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'isActive must be a boolean value (true or false)',
      code: 'INVALID_STATUS_VALUE'
    });
  }

  try {
    const { data: updatedCoaching, error } = await supabase
      .from('coachings')
      .update({ 
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', parseInt(coachingId))
      .select('id, group_name, coach_name, is_active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Coaching group not found',
          code: 'COACHING_NOT_FOUND'
        });
      }
      throw error;
    }

    console.log(`✅ Coaching group ${coachingId} status updated:`, isActive);

    res.json({
      success: true,
      message: `Coaching group ${isActive ? 'activated' : 'deactivated'} successfully`,
      coaching: {
        id: updatedCoaching.id,
        groupName: updatedCoaching.group_name,
        coachName: updatedCoaching.coach_name,
        isActive: updatedCoaching.is_active
      }
    });
  } catch (error) {
    console.error('❌ Error updating coaching status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating coaching status',
      code: 'STATUS_UPDATE_ERROR'
    });
  }
});

// Delete coaching group with enhanced safety checks
app.delete('/api/coachings/:coachingId', requireAdmin, async (req, res) => {
  const { coachingId } = req.params;

  // Validate coaching ID
  if (!Number.isInteger(parseInt(coachingId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid coaching ID',
      code: 'INVALID_COACHING_ID'
    });
  }

  try {
    // First, check if coaching group has any bookings (past or future)
    const { count: bookingCount, error: bookingError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('coaching_id', parseInt(coachingId));

    if (bookingError) throw bookingError;

    if (bookingCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete coaching group with existing bookings. Please remove or reassign all bookings first.',
        code: 'HAS_EXISTING_BOOKINGS',
        bookingCount: bookingCount
      });
    }

    // Delete the coaching group
    const { data: deletedCoaching, error: deleteError } = await supabase
      .from('coachings')
      .delete()
      .eq('id', parseInt(coachingId))
      .select('id, group_name')
      .single();

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Coaching group not found',
          code: 'COACHING_NOT_FOUND'
        });
      }
      throw deleteError;
    }

    console.log(`✅ Coaching group ${coachingId} deleted successfully`);

    res.json({
      success: true,
      message: `Coaching group "${deletedCoaching.group_name}" deleted successfully`,
      deletedCoaching: {
        id: deletedCoaching.id,
        groupName: deletedCoaching.group_name
      }
    });
  } catch (error) {
    console.error('❌ Error deleting coaching group:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting coaching group',
      code: 'COACHING_DELETE_ERROR'
    });
  }
});

// Replace with this single route for SPA handling:
app.get('*', (req, res) => {
  // Only handle non-API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`,
      code: 'API_ROUTE_NOT_FOUND',
      timestamp: new Date().toISOString()
    });
  }
  
  // Serve appropriate HTML file based on path
  let htmlFile = 'index.html';
  
  if (req.path.includes('dashboard') && req.path.includes('admin')) {
    htmlFile = 'admin-dashboard.html';
  } else if (req.path.includes('dashboard')) {
    htmlFile = 'dashboard.html';
  }
  
  try {
    res.sendFile(path.join(__dirname, 'public', htmlFile));
  } catch (error) {
    console.error(`❌ Error serving ${htmlFile}:`, error);
    res.status(500).send('Server error while loading the page');
  }
});

// Enhanced global error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Error:', err);
  
  // Don't send error details in production
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

// Enhanced 404 handler
app.use('*', (req, res) => {
  console.warn(`⚠️  404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString()
  });
});

// Enhanced server startup with better error handling
async function startServer() {
  try {
    // Test database connection
    console.log('Testing database connection...');
    const { data, error } = await supabase
      .from('members')
      .select('count')
      .limit(1);
    
    if (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
    
    console.log('Database connection successful');
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('Tennis Court Reservation System ready!');
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    console.error('Please check your database configuration and try again.');
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in production, but log it
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

startServer();