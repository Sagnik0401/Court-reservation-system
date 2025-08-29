const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🎾 Starting Tennis Court Reservation System...');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Basic server test
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: "Tennis Court System - Ready!",
    timestamp: new Date().toISOString(),
    status: "operational"
  });
});

// Login endpoint
// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and membership number required' });
  }

  try {
    const { data: member, error } = await supabase
      .from('members')
      .select('id, membership_no, email_id, first_name, last_name, role, created_at')
      .eq('email_id', email.toLowerCase())
      .single();

    if (error || password !== member.membership_no) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =========================
// ADMIN ENDPOINTS
// =========================

// Get all members (Admin only)
app.get('/api/members', async (req, res) => {
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

    res.json({
      success: true,
      members: formattedMembers
    });
  } catch (error) {
    console.error('❌ Error getting members:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Add new member (Admin only)
// Add new member
app.post('/api/register', async (req, res) => {
  const { membershipId, firstName, lastName, email, role = 'member' } = req.body;

  if (!membershipId || !firstName || !lastName || !email) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const { data: newMember, error } = await supabase
      .from('members')
      .insert([{
        membership_no: membershipId,
        first_name: firstName,
        last_name: lastName,
        email_id: email.toLowerCase(),
        role: role
      }])
      .select()
      .single();

    if (error) {
      const message = error.code === '23505' ? 'Membership ID or email already exists' : 'Server error';
      return res.status(400).json({ success: false, message });
    }

    res.json({
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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all bookings (Admin only)
// Get all bookings (Admin only)
app.post('/api/bookings/all', async (req, res) => {
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
      .filter(booking => booking.courts && (booking.members || booking.coachings)) // Filter out invalid records
      .map(booking => {
        const startTime = booking.start_time;
        const [hours, minutes] = startTime.split(':');
        const startMinutes = parseInt(hours) * 60 + parseInt(minutes);
        const endMinutes = startMinutes + booking.duration_minutes;
        const endHours = Math.floor(endMinutes / 60);
        const endMins = endMinutes % 60;
        const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

        // Handle both member bookings and coaching bookings
        let memberName = 'Unknown Member';
        let membershipId = 'N/A';
        
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
          membershipId: membershipId,
          memberName: memberName,
          courtId: booking.court_id,
          courtName: booking.courts.name,
          date: booking.booking_date,
          startTime: booking.start_time,
          endTime: endTime,
          duration: booking.duration_minutes,
          status: booking.status,
          notes: booking.notes,
          createdAt: booking.created_at,
          bookingType: booking.booking_type || 'member'
        };
      });

    res.json({
      success: true,
      bookings: formattedBookings
    });
  } catch (error) {
    console.error('❌ Error getting all bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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

// Add these endpoints to your existing server.js file

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

// Get dashboard statistics (Admin only)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get total members
    const { data: membersData, error: membersError } = await supabase
      .from('members')
      .select('count');
    
    if (membersError) throw membersError;
    
    // Get today's bookings
    const { data: todayBookings, error: todayError } = await supabase
      .from('bookings')
      .select('count')
      .eq('booking_date', today)
      .eq('status', 'confirmed');
    
    if (todayError) throw todayError;
    
    // Get active courts
    const { data: activeCourts, error: courtsError } = await supabase
      .from('courts')
      .select('count')
      .eq('is_active', true);
    
    if (courtsError) throw courtsError;
    
    // Get total revenue (if you have pricing)
    const { data: totalBookings, error: revenueError } = await supabase
      .from('bookings')
      .select('count')
      .eq('status', 'confirmed');
    
    if (revenueError) throw revenueError;

    res.json({
      success: true,
      stats: {
        totalMembers: membersData[0]?.count || 0,
        todayBookings: todayBookings[0]?.count || 0,
        activeCourts: activeCourts[0]?.count || 0,
        totalBookings: totalBookings[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get recent activity (Admin only)
// Get recent activity (Admin only)
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
      .limit(20); // Get more records to account for filtering

    if (error) throw error;

    const formattedActivity = recentBookings
      .filter(booking => booking.courts && (booking.members || booking.coachings)) // Filter valid records
      .slice(0, 10) // Take only 10 after filtering
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
      message: 'Server error'
    });
  }
});

// Clean up orphaned bookings (run this once to fix existing data)
app.post('/api/admin/cleanup-bookings', async (req, res) => {
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

    const toDelete = orphanedBookings.filter(booking => 
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
        deletedIds: idsToDelete
      });
    } else {
      res.json({
        success: true,
        message: 'No orphaned bookings found'
      });
    }
  } catch (error) {
    console.error('❌ Error cleaning up bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during cleanup'
    });
  }
});

// Bulk booking operations (Admin only)
app.post('/api/bookings/bulk', async (req, res) => {
  const { action, bookingIds } = req.body;

  if (!action || !bookingIds || !Array.isArray(bookingIds)) {
    return res.status(400).json({
      success: false,
      message: 'Action and booking IDs are required'
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
          message: 'Invalid action'
        });
    }

    const { data: updatedBookings, error } = await supabase
      .from('bookings')
      .update(updateData)
      .in('id', bookingIds)
      .select('id');

    if (error) throw error;

    console.log(`✅ Bulk ${action} completed for ${updatedBookings.length} bookings`);

    res.json({
      success: true,
      message: `${updatedBookings.length} bookings ${action}ed successfully`,
      updatedCount: updatedBookings.length
    });
  } catch (error) {
    console.error(`❌ Bulk ${action} error:`, error);
    res.status(500).json({
      success: false,
      message: `Server error during bulk ${action}`
    });
  }
});

// Add after your existing endpoints, before the static file routes

// Get all coaching groups
app.get('/api/coachings', async (req, res) => {
  try {
    const { data: coachings, error } = await supabase
      .from('coachings')
      .select('*')
      .eq('is_active', true)
      .order('group_name');

    if (error) throw error;

    const formattedCoachings = coachings.map(coaching => ({
      id: coaching.id,
      groupName: coaching.group_name,
      coachName: coaching.coach_name,
      description: coaching.description,
      maxParticipants: coaching.max_participants,
      isActive: coaching.is_active
    }));

    res.json({
      success: true,
      coachings: formattedCoachings
    });
  } catch (error) {
    console.error('❌ Error getting coachings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Create admin booking
app.post('/api/admin/bookings', async (req, res) => {
  const { courtId, date, startTime, duration, notes, bookingType, userId, coachingId } = req.body;

  if (!courtId || !date || !startTime || !duration || !bookingType) {
    return res.status(400).json({ 
      success: false, 
      message: 'Court, date, start time, duration, and booking type are required' 
    });
  }

  if (bookingType === 'member' && !userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'User ID is required for member bookings' 
    });
  }

  if (bookingType === 'coaching' && !coachingId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Coaching ID is required for coaching bookings' 
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
        message: 'Time slot already booked' 
      });
    }

    // Create booking
    const bookingData = {
      court_id: parseInt(courtId),
      booking_date: date,
      start_time: startTime,
      duration_minutes: parseInt(duration),
      status: 'confirmed',
      notes: notes || null,
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

    let entityName = '';
    if (bookingType === 'member') {
      entityName = `${booking.members.first_name} ${booking.members.last_name}`;
    } else {
      entityName = booking.coachings.group_name;
    }

    res.json({
      success: true,
      message: 'Reservation created successfully!',
      booking: {
        id: booking.id,
        courtId: booking.court_id,
        courtName: booking.courts.name,
        date: booking.booking_date,
        startTime: booking.start_time,
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
      message: 'Server error while creating reservation'
    });
  }
});

// Add these endpoints to your server.js file

// Get all coaching groups including inactive (Admin only)
app.get('/api/coachings/all', async (req, res) => {
  try {
    const { data: coachings, error } = await supabase
      .from('coachings')
      .select('*')
      .order('group_name');

    if (error) throw error;

    const formattedCoachings = coachings.map(coaching => ({
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
      coachings: formattedCoachings
    });
  } catch (error) {
    console.error('❌ Error getting all coaching groups:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Create new coaching group (Admin only)
app.post('/api/coachings', async (req, res) => {
  const { groupName, coachName, description, maxParticipants } = req.body;

  if (!groupName || !coachName) {
    return res.status(400).json({
      success: false,
      message: 'Group name and coach name are required'
    });
  }

  if (maxParticipants < 1 || maxParticipants > 20) {
    return res.status(400).json({
      success: false,
      message: 'Max participants must be between 1 and 20'
    });
  }

  try {
    const { data: newCoaching, error } = await supabase
      .from('coachings')
      .insert([{
        group_name: groupName,
        coach_name: coachName,
        description: description || null,
        max_participants: maxParticipants
      }])
      .select()
      .single();

    if (error) {
      const message = error.code === '23505' ? 'Coaching group name already exists' : 'Server error';
      return res.status(400).json({ success: false, message });
    }

    console.log('✅ Coaching group created:', newCoaching.id);

    res.json({
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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update coaching group (Admin only)
app.put('/api/coachings/:coachingId', async (req, res) => {
  const { coachingId } = req.params;
  const { groupName, coachName, description, maxParticipants } = req.body;

  if (!groupName || !coachName) {
    return res.status(400).json({
      success: false,
      message: 'Group name and coach name are required'
    });
  }

  if (maxParticipants < 1 || maxParticipants > 20) {
    return res.status(400).json({
      success: false,
      message: 'Max participants must be between 1 and 20'
    });
  }

  try {
    // Check if group name already exists (exclude current group)
    const { data: existingGroup, error: checkError } = await supabase
      .from('coachings')
      .select('id')
      .eq('group_name', groupName)
      .neq('id', parseInt(coachingId))
      .single();

    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: 'Coaching group name already exists'
      });
    }

    // Update coaching group
    const { data: updatedCoaching, error: updateError } = await supabase
      .from('coachings')
      .update({
        group_name: groupName,
        coach_name: coachName,
        description: description || null,
        max_participants: maxParticipants,
        updated_at: new Date().toISOString()
      })
      .eq('id', parseInt(coachingId))
      .select()
      .single();

    if (updateError) throw updateError;

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
      message: 'Server error while updating coaching group'
    });
  }
});

// Update coaching group status (Admin only)
app.put('/api/coachings/:coachingId/status', async (req, res) => {
  const { coachingId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'isActive must be a boolean value'
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
      .select()
      .single();

    if (error) throw error;

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
      message: 'Server error while updating coaching status'
    });
  }
});

// Delete coaching group (Admin only) - Optional, use with caution
app.delete('/api/coachings/:coachingId', async (req, res) => {
  const { coachingId } = req.params;

  try {
    // First, check if coaching group has active bookings
    const { data: activeBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('coaching_id', parseInt(coachingId))
      .eq('status', 'confirmed');

    if (bookingError) throw bookingError;

    if (activeBookings && activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete coaching group with active bookings. Please cancel or complete their bookings first.'
      });
    }

    // Delete the coaching group
    const { error: deleteError } = await supabase
      .from('coachings')
      .delete()
      .eq('id', parseInt(coachingId));

    if (deleteError) throw deleteError;

    console.log(`✅ Coaching group ${coachingId} deleted successfully`);

    res.json({
      success: true,
      message: 'Coaching group deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting coaching group:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting coaching group'
    });
  }
});

// Static file routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('💥 Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Server startup
async function startServer() {
  try {
    await supabase.from('members').select('count').limit(1);
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
  }
}

startServer();