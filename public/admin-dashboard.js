// Global variables
let currentUser = {};
let allMembers = [];
let allBookings = [];
let allCourts = [];
let refreshInterval;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
    startDynamicClock();
});

// Initialize dashboard
async function initializeDashboard() {
    // Get user data from sessionStorage (matching your login system)
    const userData = sessionStorage.getItem('user');
    if (!userData) {
        showToast('Please log in to access admin dashboard.', 'error');
        setTimeout(() => location.href = 'index.html', 2000);
        return;
    }

    try {
        currentUser = JSON.parse(userData);
        console.log('👤 Current user:', currentUser);
    } catch (error) {
        console.error('Error parsing user data:', error);
        showToast('Invalid session data. Please log in again.', 'error');
        setTimeout(() => location.href = 'index.html', 2000);
        return;
    }

    // Check if user is admin
    if (!currentUser.id || currentUser.role !== 'admin') {
        showToast('Access denied. Admin privileges required.', 'error');
        console.log('❌ Access denied. User role:', currentUser.role);
        setTimeout(() => location.href = 'dashboard.html', 2000);
        return;
    }

    console.log('✅ Admin access granted for:', currentUser.name);
    updateCurrentTime();
    await loadDashboardData();
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Member search
    document.getElementById('member-search').addEventListener('input', filterMembers);

    // Booking filters
    document.getElementById('booking-date-filter').addEventListener('change', filterBookings);
    document.getElementById('booking-status-filter').addEventListener('change', filterBookings);

    // Select all bookings
    document.getElementById('select-all-bookings').addEventListener('change', toggleAllBookingSelection);

    // Form submissions
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);
    document.getElementById('edit-member-form').addEventListener('submit', handleEditMember);
    document.getElementById('edit-booking-form').addEventListener('submit', handleEditBooking);

    // Modal close on outside click
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    });
}

// Dynamic clock update
function updateCurrentTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleString();
}

// Start dynamic clock
function startDynamicClock() {
    updateCurrentTime(); // Update immediately
    setInterval(updateCurrentTime, 1000); // Update every second
}

// Load all dashboard data
async function loadDashboardData() {
    showLoading(true);
    try {
        // Load bookings first so stats can use the data
        await loadBookings();
        await Promise.all([
            loadStats(),
            loadMembers(),
            loadCourts(),
            loadRecentActivity()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Error loading dashboard data', 'error');
    } finally {
        showLoading(false);
    }
}

// Load dashboard statistics
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            // Calculate today's bookings with time-based completion
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();
            
            let todayBookingsCount = 0;
            let totalBookingsCount = data.stats.totalBookings;
            
            // If we have allBookings loaded, recalculate today's active bookings
            if (allBookings && allBookings.length > 0) {
                todayBookingsCount = allBookings.filter(booking => {
                    if (booking.date !== today) return false;
                    if (booking.status === 'cancelled') return false;
                    
                    // Check if booking is still active (not completed by time)
                    const bookingDate = new Date(booking.date);
                    const [hours, minutes] = booking.startTime.split(':');
                    const startTime = new Date(bookingDate);
                    startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                    const endTime = new Date(startTime.getTime() + booking.duration * 60 * 1000);
                    const twoMinutesAfterEnd = new Date(endTime.getTime() + 2 * 60 * 1000);
                    
                    return now <= twoMinutesAfterEnd;
                }).length;
            } else {
                todayBookingsCount = data.stats.todayBookings;
            }
            
            document.getElementById('total-members').textContent = data.stats.totalMembers;
            document.getElementById('today-bookings').textContent = todayBookingsCount;
            document.getElementById('active-courts').textContent = data.stats.activeCourts;
            document.getElementById('total-bookings').textContent = totalBookingsCount;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load members
async function loadMembers() {
    try {
        const response = await fetch('/api/members');
        const data = await response.json();
        
        if (data.success) {
            allMembers = data.members;
            renderMembers(allMembers);
        }
    } catch (error) {
        console.error('Error loading members:', error);
        showToast('Error loading members', 'error');
    }
}

// Render members table
function renderMembers(members) {
    const tbody = document.getElementById('members-tbody');
    tbody.innerHTML = '';

    // Sort members alphabetically by first name
    const sortedMembers = [...members].sort((a, b) => {
        const firstNameA = a.name.split(' ')[0].toLowerCase();
        const firstNameB = b.name.split(' ')[0].toLowerCase();
        return firstNameA.localeCompare(firstNameB);
    });

    sortedMembers.forEach((member, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
    <td>${index + 1}</td>
    <td>${member.membershipId}</td>
            <td>${member.name}</td>
            <td>${member.email}</td>
            <td><span class="status-badge role-${member.role}">${member.role}</span></td>
            <td>${new Date(member.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editMember(${member.id})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember(${member.id}, '${member.name}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Filter members
function filterMembers() {
    const searchTerm = document.getElementById('member-search').value.toLowerCase();
    const filteredMembers = allMembers.filter(member =>
        member.name.toLowerCase().includes(searchTerm) ||
        member.email.toLowerCase().includes(searchTerm) ||
        member.membershipId.toLowerCase().includes(searchTerm)
    );
    renderMembers(filteredMembers);
}

// Load bookings
async function loadBookings() {
    try {
        const response = await fetch('/api/bookings/all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        
        if (data.success) {
            allBookings = data.bookings;
            renderBookings(allBookings);
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
        showToast('Error loading bookings', 'error');
    }
}

// Render bookings table
function renderBookings(bookings) {
    const tbody = document.getElementById('bookings-tbody');
    tbody.innerHTML = '';

    bookings.forEach((booking, index) => {
        // Calculate if booking should be considered completed based on time
        const bookingDate = new Date(booking.date);
        const [hours, minutes] = booking.startTime.split(':');
        const startTime = new Date(bookingDate);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        
        const endTime = new Date(startTime.getTime() + booking.duration * 60 * 1000);
        const twoMinutesAfterEnd = new Date(endTime.getTime() + 2 * 60 * 1000);
        const now = new Date();
        
        // Update status based on time if it's not already cancelled
        let displayStatus = booking.status;
        if (booking.status === 'confirmed' && now > twoMinutesAfterEnd) {
            displayStatus = 'completed';
        }
        
        // Check if cancelled booking is past the 30-minute edit window
        let canEdit = true;
        if (booking.status === 'cancelled') {
            const thirtyMinutesAfterEnd = new Date(endTime.getTime() + 30 * 60 * 1000);
            if (new Date() > thirtyMinutesAfterEnd) {
                canEdit = false;
            }
        }   

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="booking-checkbox" data-booking-id="${booking.id}"></td>
            <td>${index + 1}</td>
            <td>${booking.memberName} (${booking.membershipId})</td>
            <td>${booking.courtName}</td>
            <td>${new Date(booking.date).toLocaleDateString()}</td>
            <td>${booking.startTime} - ${booking.endTime}</td>
            <td>${booking.duration} min</td>
            <td><span class="status-badge status-${displayStatus}">${displayStatus}</span></td>
            <td>
                ${canEdit ? 
                    `<button class="btn btn-sm btn-secondary" onclick="editBooking(${booking.id})">Edit</button>` :
                    `<button class="btn btn-sm btn-secondary" disabled title="Cannot edit ${displayStatus} booking">Edit</button>`
                    
                }
                ${displayStatus === 'confirmed' ? 
                    `<button class="btn btn-sm btn-success" onclick="completeBooking(${booking.id})">Complete</button>
                     <button class="btn btn-sm btn-warning" onclick="cancelBooking(${booking.id})">Cancel</button>` :
                    displayStatus === 'pending' ?
                    `<button class="btn btn-sm btn-warning" onclick="cancelBooking(${booking.id})">Cancel</button>` : ''
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Filter bookings
function filterBookings() {
    const dateFilter = document.getElementById('booking-date-filter').value;
    const statusFilter = document.getElementById('booking-status-filter').value;
    const now = new Date();
    
    let filteredBookings = allBookings.map(booking => {
        // Calculate display status based on time
        const bookingDate = new Date(booking.date);
        const [hours, minutes] = booking.startTime.split(':');
        const startTime = new Date(bookingDate);
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const endTime = new Date(startTime.getTime() + booking.duration * 60 * 1000);
        const twoMinutesAfterEnd = new Date(endTime.getTime() + 2 * 60 * 1000);
        
        let displayStatus = booking.status;
        if (booking.status === 'confirmed' && now > twoMinutesAfterEnd) {
            displayStatus = 'completed';
        }
        
        return { ...booking, displayStatus };
    });
    
    if (dateFilter) {
        filteredBookings = filteredBookings.filter(booking => booking.date === dateFilter);
    }
    
    if (statusFilter) {
        filteredBookings = filteredBookings.filter(booking => {
            return statusFilter === 'completed' ? 
                (booking.displayStatus === 'completed' || booking.status === 'completed') :
                booking.status === statusFilter;
        });
    }
    
    renderBookings(filteredBookings);
}

// Clear booking filters
function clearBookingFilters() {
    document.getElementById('booking-date-filter').value = '';
    document.getElementById('booking-status-filter').value = '';
    renderBookings(allBookings);
}

// Toggle all booking selection
function toggleAllBookingSelection() {
    const selectAll = document.getElementById('select-all-bookings').checked;
    document.querySelectorAll('.booking-checkbox').forEach(checkbox => {
        checkbox.checked = selectAll;
    });
}

// Load courts
async function loadCourts() {
    try {
        const response = await fetch('/api/courts/all');
        const data = await response.json();
        
        if (data.success) {
            allCourts = data.courts;
            renderCourts(allCourts);
            populateCourtOptions();
        }
    } catch (error) {
        console.error('Error loading courts:', error);
        showToast('Error loading courts', 'error');
    }
}

// Render courts grid
function renderCourts(courts) {
    const grid = document.getElementById('courts-grid');
    grid.innerHTML = '';

    courts.forEach(court => {
        const card = document.createElement('div');
        card.className = 'court-card';
        card.innerHTML = `
            <div class="court-header">
                <h3>${court.name}</h3>
            </div>
            <div class="court-status">
                <div class="status-indicator status-${court.is_active ? 'active' : 'inactive'}"></div>
                <span>Status: ${court.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <p><strong>Surface:</strong> ${court.surface_type}</p>
            <div style="margin-top: 1rem;">
                <button class="btn ${court.is_active ? 'btn-warning' : 'btn-success'}" 
                        onclick="toggleCourtStatus(${court.id}, ${court.is_active})">
                    ${court.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Toggle court status
async function toggleCourtStatus(courtId, currentStatus) {
    try {
        const response = await fetch(`/api/courts/${courtId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: !currentStatus })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            await loadCourts();
            await loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error toggling court status:', error);
        showToast('Error updating court status', 'error');
    }
}

// Load recent activity
async function loadRecentActivity() {
    try {
        const response = await fetch('/api/admin/recent-activity');
        const data = await response.json();
        
        if (data.success) {
            renderRecentActivity(data.activities);
        }
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

// Render recent activity
function renderRecentActivity(activities) {
    const feed = document.getElementById('activity-feed');
    feed.innerHTML = '';

    if (activities.length === 0) {
        feed.innerHTML = '<div style="padding: 2rem; text-align: center; color: #666;">No recent activity</div>';
        return;
    }

    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        let activityText = '';
        if (activity.bookingType === 'coaching') {
            activityText = `${activity.memberName} session scheduled`;
        } else {
            activityText = `${activity.memberName} booked ${activity.courtName}`;
        }
        
        item.innerHTML = `
            <div class="activity-avatar">
                ${activity.memberName.charAt(0)}
            </div>
            <div class="activity-content">
                <div class="activity-title">
                    ${activityText}
                </div>
                <div class="activity-details">
                    ${new Date(activity.date).toLocaleDateString()} at ${activity.startTime} - ${activity.status}
                </div>
            </div>
            <div class="activity-time">
                ${getRelativeTime(activity.createdAt)}
            </div>
        `;
        feed.appendChild(item);
    });
}

// Get relative time
function getRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Member management functions
function openAddMemberModal() {
    document.getElementById('add-member-form').reset();
    openModal('add-member-modal');
}

function editMember(memberId) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;

    // Parse name
    const nameParts = member.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    document.getElementById('edit-member-id').value = member.id;
    document.getElementById('edit-membership-id').value = member.membershipId;
    document.getElementById('edit-first-name').value = firstName;
    document.getElementById('edit-last-name').value = lastName;
    document.getElementById('edit-email').value = member.email;
    document.getElementById('edit-role').value = member.role;

    openModal('edit-member-modal');
}

async function deleteMember(memberId, memberName) {
    if (!confirm(`Are you sure you want to delete ${memberName}? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/members/${memberId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Member deleted successfully', 'success');
            await loadMembers();
            await loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting member:', error);
        showToast('Error deleting member', 'error');
    }
}

// Handle add member form
async function handleAddMember(e) {
    e.preventDefault();
    
    const formData = {
        membershipId: document.getElementById('new-membership-id').value,
        firstName: document.getElementById('new-first-name').value,
        lastName: document.getElementById('new-last-name').value,
        email: document.getElementById('new-email').value,
        role: document.getElementById('new-role').value
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Member added successfully', 'success');
            closeModal('add-member-modal');
            await loadMembers();
            await loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error adding member:', error);
        showToast('Error adding member', 'error');
    }
}

// Handle edit member form
async function handleEditMember(e) {
    e.preventDefault();
    
    const memberId = document.getElementById('edit-member-id').value;
    const formData = {
        membershipId: document.getElementById('edit-membership-id').value,
        firstName: document.getElementById('edit-first-name').value,
        lastName: document.getElementById('edit-last-name').value,
        email: document.getElementById('edit-email').value,
        role: document.getElementById('edit-role').value
    };

    try {
        const response = await fetch(`/api/members/${memberId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Member updated successfully', 'success');
            closeModal('edit-member-modal');
            await loadMembers();
            await loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating member:', error);
        showToast('Error updating member', 'error');
    }
}

// Booking management functions
function editBooking(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return;

    document.getElementById('edit-booking-id').value = booking.id;
    document.getElementById('edit-booking-court').value = booking.courtId;
    document.getElementById('edit-booking-date').value = booking.date;
    document.getElementById('edit-booking-duration').value = booking.duration;
    document.getElementById('edit-booking-notes').value = booking.notes || '';

    // Populate time options and set current time
    populateTimeOptions();
    document.getElementById('edit-booking-time').value = booking.startTime;

    openModal('edit-booking-modal');
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }

    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Booking cancelled successfully', 'success');
            await loadBookings();
            await loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error cancelling booking:', error);
        showToast('Error cancelling booking', 'error');
    }
}

async function completeBooking(bookingId) {
    try {
        const response = await fetch(`/api/bookings/${bookingId}/complete`, {
            method: 'PATCH'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Booking marked as completed', 'success');
            await loadBookings();
            await loadStats();
            await loadRecentActivity();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error completing booking:', error);
        showToast('Error completing booking', 'error');
    }
}

// Handle edit booking form
async function handleEditBooking(e) {
    e.preventDefault();
    
    const bookingId = document.getElementById('edit-booking-id').value;
    const formData = {
        courtId: parseInt(document.getElementById('edit-booking-court').value),
        date: document.getElementById('edit-booking-date').value,
        startTime: document.getElementById('edit-booking-time').value,
        duration: parseInt(document.getElementById('edit-booking-duration').value),
        notes: document.getElementById('edit-booking-notes').value
    };

    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Booking updated successfully', 'success');
            closeModal('edit-booking-modal');
            await loadBookings();
            await loadStats();
            await loadRecentActivity();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating booking:', error);
        showToast('Error updating booking', 'error');
    }
}

// Open create booking modal
function openCreateBookingModal() {
    document.getElementById('create-booking-form').reset();
    populateTimeOptionsForCreate();
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('create-booking-date').min = today;
    document.getElementById('create-booking-date').value = today;
    
    openModal('create-booking-modal');
}

// Populate time options for create
function populateTimeOptionsForCreate() {
    const timeSelect = document.getElementById('create-booking-time');
    timeSelect.innerHTML = '<option value="">Select Time</option>';
    
    const morningSlots = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    const eveningSlots = ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
    
    const allSlots = [...morningSlots, ...eveningSlots];
    
    allSlots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
    });
}

// Bulk booking actions
async function bulkAction(action) {
    const selectedBookings = Array.from(document.querySelectorAll('.booking-checkbox:checked'))
        .map(cb => parseInt(cb.dataset.bookingId));

    if (selectedBookings.length === 0) {
        showToast('Please select bookings to perform bulk action', 'warning');
        return;
    }

    if (!confirm(`Are you sure you want to ${action} ${selectedBookings.length} booking(s)?`)) {
        return;
    }

    try {
        const response = await fetch('/api/bookings/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, bookingIds: selectedBookings })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            await loadBookings();
            await loadStats();
            // Uncheck select all
            document.getElementById('select-all-bookings').checked = false;
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Error performing bulk action:', error);
        showToast('Error performing bulk action', 'error');
    }
}

// Populate court options in forms
function populateCourtOptions() {
    const courtSelect = document.getElementById('edit-booking-court');
    courtSelect.innerHTML = '';
    
    allCourts.forEach(court => {
        if (court.is_active) {
            const option = document.createElement('option');
            option.value = court.id;
            option.textContent = court.name;
            courtSelect.appendChild(option);
        }
    });
}

// Populate time options
function populateTimeOptions() {
    const timeSelect = document.getElementById('edit-booking-time');
    timeSelect.innerHTML = '';
    
    const morningSlots = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    const eveningSlots = ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
    
    const allSlots = [...morningSlots, ...eveningSlots];
    
    allSlots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
    });
}

// Modal management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';  // Changed from 'block' to 'flex'
    document.body.style.overflow = 'hidden';
}

// Store the original closeModal function if it exists
const originalCloseModal = window.closeModal;

function closeModal(modalId) {
    if (modalId === 'check-availability-modal') {
        closeAvailabilityModal();
    } else {
        // Call the original closeModal logic
        document.getElementById(modalId).style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Make sure it's available globally
window.closeModal = closeModal;

// Loading overlay
function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// Toast notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.getElementById('toast-container').appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Remove on click
    toast.addEventListener('click', () => {
        toast.remove();
    });
}

// Add these functions to your admin-dashboard.js file

// Open availability modal
function openAvailabilityModal() {
    const modal = document.getElementById('check-availability-modal');
    const courtSelect = document.getElementById('availability-court-select');
    const dateSelect = document.getElementById('availability-date-select');
    const resultsDiv = document.getElementById('availability-results');
    
    if (!modal || !courtSelect || !dateSelect) {
        console.error('Availability modal elements not found');
        return;
    }
    
    // Populate court options
    courtSelect.innerHTML = '<option value="">Choose a court...</option>';
    allCourts.forEach(court => {
        courtSelect.innerHTML += `<option value="${court.id}">${court.name} (${court.surface_type})</option>`;
    });
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    dateSelect.min = today;
    dateSelect.value = '';
    
    // Clear results
    if (resultsDiv) {
        resultsDiv.innerHTML = '<p class="text-muted">Select a court and date to check availability</p>';
    }
    
    // Remove existing event listeners to prevent duplicates
    courtSelect.removeEventListener('change', handleAvailabilityChange);
    dateSelect.removeEventListener('change', handleAvailabilityChange);
    
    // Add event listeners
    courtSelect.addEventListener('change', handleAvailabilityChange);
    dateSelect.addEventListener('change', handleAvailabilityChange);
    
    openModal('check-availability-modal');
    console.log('Availability modal opened');
}

// Handle court/date selection changes
function handleAvailabilityChange() {
    updateAvailabilityResults();
}

// Update availability results
async function updateAvailabilityResults() {
    const courtId = document.getElementById('availability-court-select')?.value;
    const date = document.getElementById('availability-date-select')?.value;
    const resultsDiv = document.getElementById('availability-results');
    
    if (!resultsDiv) {
        console.error('Results div not found');
        return;
    }
    
    if (!courtId || !date) {
        resultsDiv.innerHTML = '<p class="text-muted">Select a court and date to check availability</p>';
        return;
    }

    try {
        console.log(`Checking availability for Court ${courtId} on ${date}`);
        
        resultsDiv.innerHTML = '<p class="text-muted"><i class="loading-spinner-small"></i> Loading availability...</p>';
        
        const response = await fetch(`/api/bookings/availability?court=${courtId}&date=${date}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            displayAvailabilityResults(data.availability, courtId, date);
        } else {
            resultsDiv.innerHTML = '<p class="text-muted">Error: ' + (data.message || 'Failed to load availability') + '</p>';
            showToast('Error fetching availability: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error checking availability:', error);
        resultsDiv.innerHTML = '<p class="text-muted">Error loading availability. Please try again.</p>';
        showToast('Error checking availability. Please try again.', 'error');
    }
}

// Display availability results
function displayAvailabilityResults(availability, courtId, date) {
    const resultsDiv = document.getElementById('availability-results');
    if (!resultsDiv || !availability || availability.length === 0) {
        resultsDiv.innerHTML = '<p class="text-muted">No availability data found</p>';
        return;
    }

    // Filter and categorize slots
    const morningSlots = availability.filter(slot => {
        const [hour] = slot.time.split(':');
        return parseInt(hour) < 12;
    });

    const eveningSlots = availability.filter(slot => {
        const [hour] = slot.time.split(':');
        return parseInt(hour) >= 15;
    });

    // Find court details
    const court = allCourts.find(c => c.id == courtId);
    const courtName = court ? court.name : `Court ${courtId}`;
    const formattedDate = new Date(date).toLocaleDateString();

    // Build HTML
    let html = `<h3>Availability for ${courtName} on ${formattedDate}</h3>`;
    
    // Add legend
    html += `
        <div class="availability-status-legend">
            <div class="legend-item">
                <div class="legend-color available"></div>
                <span>Available</span>
            </div>
            <div class="legend-item">
                <div class="legend-color booked"></div>
                <span>Booked</span>
            </div>
        </div>
    `;
    
    // Add morning slots
    if (morningSlots.length > 0) {
        html += '<h4>Morning Slots (6:00 AM - 11:30 AM)</h4>';
        html += '<div class="time-slots-grid">';
        morningSlots.forEach(slot => {
            html += `<div class="court-slot ${slot.status}" data-time="${slot.time}">
                ${formatTimeForDisplay(slot.time)}
            </div>`;
        });
        html += '</div>';
    }

    // Add evening slots
    if (eveningSlots.length > 0) {
        html += '<h4>Evening Slots (3:00 PM - 10:00 PM)</h4>';
        html += '<div class="time-slots-grid">';
        eveningSlots.forEach(slot => {
            html += `<div class="court-slot ${slot.status}" data-time="${slot.time}">
                ${formatTimeForDisplay(slot.time)}
            </div>`;
        });
        html += '</div>';
    }

    // Add summary
    const availableCount = availability.filter(slot => slot.status === 'available').length;
    const bookedCount = availability.filter(slot => slot.status === 'booked').length;
    
    html += `
        <div style="margin-top: 1.5rem; padding: 1rem; background: white; border-radius: 6px; border: 1px solid #dee2e6;">
            <strong>Summary:</strong> 
            <span style="color: #155724;">${availableCount} available slots</span>, 
            <span style="color: #721c24;">${bookedCount} booked slots</span>
        </div>
    `;

    resultsDiv.innerHTML = html;
}

// Format time for display
function formatTimeForDisplay(timeString) {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

// Enhanced modal close function for availability modal
function closeAvailabilityModal() {
    const modal = document.getElementById('check-availability-modal');
    if (modal) {
        // Close the modal directly instead of calling closeModal again
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Clean up event listeners
        const courtSelect = document.getElementById('availability-court-select');
        const dateSelect = document.getElementById('availability-date-select');
        
        if (courtSelect) courtSelect.removeEventListener('change', handleAvailabilityChange);
        if (dateSelect) dateSelect.removeEventListener('change', handleAvailabilityChange);
        
        // Reset form
        if (courtSelect) courtSelect.value = '';
        if (dateSelect) dateSelect.value = '';
        
        const resultsDiv = document.getElementById('availability-results');
        if (resultsDiv) {
            resultsDiv.innerHTML = '<p class="text-muted">Select a court and date to check availability</p>';
        }
    }
}