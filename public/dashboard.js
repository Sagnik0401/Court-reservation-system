// Tennis Court Dashboard JavaScript
// Centralized API configuration and error handling
const API_BASE_URL = window.location.origin;

// Updated fetch function with proper error handling
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        // Check if response is HTML instead of JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Server returned HTML instead of JSON:', text.substring(0, 200));
            throw new Error('Server error - returned HTML instead of JSON. Check server logs.');
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

class TennisCourtDashboard {
    constructor() {
        this.user = null;
        this.bookings = [];
        this.courts = [];
        this.availableSlots = [];
        this.init();
    }
    

    init() {
        console.log('🎾 Initializing Tennis Court Dashboard...');
        this.loadUser();
        this.setupEventListeners();
        this.loadCourts();
        this.generateTimeSlots();
        this.loadBookings();
        this.updateDashboardStats();
        this.hideLoadingScreen();
    }

    loadUser() {
        try {
            const userData = sessionStorage.getItem('user');
            if (!userData) {
                console.error('❌ No user data found, redirecting to login');
                window.location.href = '/';
                return;
            }
            
            this.user = JSON.parse(userData);
            console.log('👤 User loaded:', this.user);
            this.updateUserDisplay();
        } catch (error) {
            console.error('❌ Error loading user data:', error);
            window.location.href = '/';
        }
    }

    updateUserDisplay() {
        const elements = {
            userName: document.getElementById('userName'),
            userEmail: document.getElementById('userEmail'),
            dashboardUserName: document.getElementById('dashboardUserName'),
            profileName: document.getElementById('profileName'),
            profileEmail: document.getElementById('profileEmail'),
            profileMembershipId: document.getElementById('profileMembershipId')
        };

        Object.entries(elements).forEach(([key, element]) => {
            if (element) {
                switch (key) {
                    case 'userName':
                    case 'dashboardUserName':
                    case 'profileName':
                        element.textContent = this.user.name;
                        break;
                    case 'userEmail':
                    case 'profileEmail':
                        element.textContent = this.user.email;
                        break;
                    case 'profileMembershipId':
                        element.textContent = this.user.membershipId;
                        break;
                }
            }
        });
    }

    // Updated loadCourts method using apiCall
    async loadCourts() {
        try {
            console.log('🏟️ Loading courts...');
            const data = await apiCall('/api/courts');
            
            this.courts = data.courts;
            console.log(`✅ Loaded ${this.courts.length} courts`);
            this.populateCourtSelect();
        } catch (error) {
            console.error('Error loading courts:', error);
            this.showNotification('Error loading courts', 'error');
        }
    }

    populateCourtSelect() {
        const courtSelect = document.getElementById('courtSelect');
        if (!courtSelect) return;

        courtSelect.innerHTML = '<option value="">Select a court...</option>';
        
        this.courts.forEach(court => {
            if (court.is_active) {
                courtSelect.innerHTML += `<option value="${court.id}">${court.name} (${court.surface_type})</option>`;
            }
        });
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.showSection(section);
            });
        });

        // Booking form
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            bookingForm.addEventListener('submit', (e) => this.handleBookingSubmit(e));
        }

        // Court and date selection
        const courtSelect = document.getElementById('courtSelect');
        const bookingDate = document.getElementById('bookingDate');
        
        if (courtSelect) {
            courtSelect.addEventListener('change', () => this.updateAvailability());
        }
        
        if (bookingDate) {
            bookingDate.addEventListener('change', () => this.updateAvailability());
            // Set minimum date to today
            bookingDate.min = new Date().toISOString().split('T')[0];
        }

        // Booking filter
        const bookingFilter = document.getElementById('bookingFilter');
        if (bookingFilter) {
            bookingFilter.addEventListener('change', () => this.filterBookings());
        }
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        document.getElementById(`${sectionName}-section`).classList.add('active');

        // Load section-specific data
        switch (sectionName) {
            case 'dashboard':
                this.updateDashboardStats();
                break;
            case 'reservations':
                this.updateAvailability();
                break;
            case 'my-bookings':
                this.displayBookings();
                break;
            case 'profile':
                this.updateProfileStats();
                break;
        }
    }

    generateTimeSlots() {
        const startTime = document.getElementById('startTime');
        if (!startTime) return;

        startTime.innerHTML = '<option value="">Select time...</option>';
        
        // Morning slots: 6:00 AM to 11:30 AM
        const morningSlots = [];
        for (let hour = 6; hour <= 11; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                if (hour === 11 && minute > 30) break; // Stop at 11:30 AM
                morningSlots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
            }
        }

        // Evening slots: 3:00 PM to 10:00 PM
        const eveningSlots = [];
        for (let hour = 15; hour <= 22; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                if (hour === 22 && minute > 0) break; // Stop at 10:00 PM
                eveningSlots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
            }
        }

        // Add morning slots
        morningSlots.forEach(timeString => {
            const displayTime = this.formatTime(timeString);
            startTime.innerHTML += `<option value="${timeString}">${displayTime}</option>`;
        });

        // Add separator
        startTime.innerHTML += `<option disabled>── Evening Slots ──</option>`;

        // Add evening slots
        eveningSlots.forEach(timeString => {
            const displayTime = this.formatTime(timeString);
            startTime.innerHTML += `<option value="${timeString}">${displayTime}</option>`;
        });
    }

    formatTime(timeString) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }

    // Updated updateAvailability method using apiCall
    async updateAvailability() {
        const courtId = document.getElementById('courtSelect')?.value;
        const date = document.getElementById('bookingDate')?.value;
        
        if (!courtId || !date) {
            this.clearAvailabilityGrid();
            return;
        }

        try {
            console.log(`🔍 Checking availability for Court ${courtId} on ${date}`);
            
            const data = await apiCall(`/api/bookings/availability?court=${courtId}&date=${date}`);
            this.displayAvailabilityGrid(data.availability, courtId, date);
        } catch (error) {
            console.error('Error checking availability:', error);
            this.showNotification('Error checking availability. Please try again.', 'error');
        }
    }

    displayAvailabilityGrid(availability, courtId, date) {
        const availabilityGrid = document.getElementById('availabilityGrid');
        if (!availabilityGrid) return;

        if (!availability || availability.length === 0) {
            availabilityGrid.innerHTML = '<p class="text-muted">No availability data found</p>';
            return;
        }

        const morningSlots = availability.filter(slot => {
            const [hour] = slot.time.split(':');
            return parseInt(hour) < 12;
        });

        const eveningSlots = availability.filter(slot => {
            const [hour] = slot.time.split(':');
            return parseInt(hour) >= 15;
        });

        let html = '';
        
        if (morningSlots.length > 0) {
            html += '<h4>Morning Slots (6:00 AM - 11:30 AM)</h4>';
            html += '<div class="time-slots-grid">';
            morningSlots.forEach(slot => {
                html += `<div class="court-slot ${slot.status}" data-time="${slot.time}">
                    ${this.formatTime(slot.time)} - ${this.capitalizeFirst(slot.status)}
                </div>`;
            });
            html += '</div>';
        }

        if (eveningSlots.length > 0) {
            html += '<h4>Evening Slots (3:00 PM - 10:00 PM)</h4>';
            html += '<div class="time-slots-grid">';
            eveningSlots.forEach(slot => {
                html += `<div class="court-slot ${slot.status}" data-time="${slot.time}">
                    ${this.formatTime(slot.time)} - ${this.capitalizeFirst(slot.status)}
                </div>`;
            });
            html += '</div>';
        }

        availabilityGrid.innerHTML = html;
    }

    clearAvailabilityGrid() {
        const availabilityGrid = document.getElementById('availabilityGrid');
        if (availabilityGrid) {
            availabilityGrid.innerHTML = '<p class="text-muted">Select a court and date to view availability</p>';
        }
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Updated handleBookingSubmit method using apiCall
    async handleBookingSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const bookingData = {
            courtId: formData.get('courtSelect') || document.getElementById('courtSelect').value,
            date: formData.get('bookingDate') || document.getElementById('bookingDate').value,
            startTime: formData.get('startTime') || document.getElementById('startTime').value,
            duration: parseInt(formData.get('duration') || document.getElementById('duration').value),
            notes: formData.get('bookingNotes') || document.getElementById('bookingNotes').value,
            userId: this.user.id
        };

        // Validate form data
        if (!bookingData.courtId || !bookingData.date || !bookingData.startTime || !bookingData.duration) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        // Check if date is not in the past
        const selectedDate = new Date(bookingData.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
            this.showNotification('Cannot book courts for past dates', 'error');
            return;
        }

        try {
            console.log('📅 Submitting booking:', bookingData);
            
            const submitBtn = document.querySelector('.submit-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking...';

            const result = await apiCall('/api/bookings', {
                method: 'POST',
                body: JSON.stringify(bookingData)
            });

            this.showNotification('Court booked successfully!', 'success');
            this.resetBookingForm();
            this.loadBookings(); // Refresh bookings list
            this.updateDashboardStats();
            this.updateAvailability(); // Refresh availability
            
            // Show booking confirmation
            this.showBookingConfirmation(result.booking);
        } catch (error) {
            console.error('❌ Booking error:', error);
            this.showNotification(`Booking failed: ${error.message}`, 'error');
        } finally {
            const submitBtn = document.querySelector('.submit-btn');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-calendar-plus"></i> Book Court';
        }
    }

    showBookingConfirmation(booking) {
        const court = this.courts.find(c => c.id == booking.courtId);
        const endTime = this.calculateEndTime(booking.startTime, booking.duration);
        
        const message = `
            <strong>Booking Confirmed!</strong><br>
            Court: ${booking.courtName || (court ? court.name : `Court ${booking.courtId}`)}<br>
            Date: ${new Date(booking.date).toLocaleDateString()}<br>
            Time: ${this.formatTime(booking.startTime)} - ${this.formatTime(endTime)}
        `;
        
        this.showNotification(message, 'success', 5000);
    }

    calculateEndTime(startTime, duration) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const startMinutes = hours * 60 + minutes;
        const endMinutes = startMinutes + duration;
        const endHours = Math.floor(endMinutes / 60);
        const endMins = endMinutes % 60;
        return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    }

    resetBookingForm() {
        const form = document.getElementById('bookingForm');
        if (form) {
            form.reset();
            this.clearAvailabilityGrid();
        }
    }

    // Updated loadBookings method using apiCall
    async loadBookings() {
        try {
            console.log('📋 Loading user bookings...');
            
            const data = await apiCall(`/api/bookings/user/${this.user.id}`);
            
            this.bookings = data.bookings || [];
            console.log(`✅ Loaded ${this.bookings.length} bookings`);
            this.displayBookings();
        } catch (error) {
            console.error('Error loading bookings:', error);
            this.showNotification('Error loading bookings', 'error');
            this.bookings = [];
            this.displayBookings();
        }
    }

    displayBookings() {
        const bookingsList = document.getElementById('bookingsList');
        if (!bookingsList) return;

        const filteredBookings = this.getFilteredBookings();
        
        if (filteredBookings.length === 0) {
            bookingsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No bookings found</h3>
                    <p>You don't have any bookings matching the current filter.</p>
                </div>
            `;
            return;
        }

        bookingsList.innerHTML = filteredBookings.map(booking => this.createBookingCard(booking)).join('');
    }

    getFilteredBookings() {
    const filter = document.getElementById('bookingFilter')?.value || 'all';
    const now = new Date();
    
    return this.bookings.filter(booking => {
        const bookingDate = new Date(booking.date);
        const [hours, minutes] = booking.startTime.split(':').map(Number);
        const startDateTime = new Date(bookingDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        // Calculate end time
        const endDateTime = new Date(startDateTime.getTime() + (booking.duration * 60000) + (2 * 60000)); // Add 2 minutes buffer
        
        const isCompleted = now > endDateTime || booking.status === 'completed';
        const isUpcoming = now < endDateTime && booking.status !== 'cancelled' && booking.status !== 'completed';
        
        switch (filter) {
            case 'upcoming':
                return isUpcoming;
            case 'past':
                return isCompleted;
            case 'cancelled':
                return booking.status === 'cancelled';
            default:
                return true;
        }
    }).sort((a, b) => {
        const dateComparison = new Date(b.date) - new Date(a.date);
        if (dateComparison !== 0) return dateComparison;
        return b.startTime.localeCompare(a.startTime);
    });
}

    createBookingCard(booking) {
    const court = this.courts.find(c => c.id == booking.courtId);
    const endTime = this.calculateEndTime(booking.startTime, booking.duration);
    const bookingDate = new Date(booking.date);
    const now = new Date();
    
    // Calculate actual start and end times
    const [hours, minutes] = booking.startTime.split(':').map(Number);
    const startDateTime = new Date(bookingDate);
    startDateTime.setHours(hours, minutes, 0, 0);
    const endDateTime = new Date(startDateTime.getTime() + (booking.duration * 60000) + (2 * 60000));
    
    const isUpcoming = now < endDateTime && booking.status !== 'cancelled';
    
    // Check if booking can be cancelled (at least 1 hour before start time)
    const hourBeforeBooking = new Date(startDateTime.getTime() - 60 * 60 * 1000);
    const canCancel = isUpcoming && now < hourBeforeBooking;

    return `
        <div class="booking-card ${booking.status}">
            <div class="booking-header">
                <div>
                    <div class="booking-title">${booking.courtName || (court ? court.name : `Court ${booking.courtId}`)} - ${court ? court.surface_type : 'Clay'}</div>
                </div>
                <div class="booking-status ${booking.status}">${this.capitalizeFirst(booking.status)}</div>
            </div>
            
            <div class="booking-details">
                <div class="booking-detail">
                    <div class="booking-detail-label">Date</div>
                    <div class="booking-detail-value">${bookingDate.toLocaleDateString()}</div>
                </div>
                <div class="booking-detail">
                    <div class="booking-detail-label">Time</div>
                    <div class="booking-detail-value">${this.formatTime(booking.startTime)} - ${this.formatTime(endTime)}</div>
                </div>
                <div class="booking-detail">
                    <div class="booking-detail-label">Duration</div>
                    <div class="booking-detail-value">${booking.duration} minutes</div>
                </div>
                <div class="booking-detail">
                    <div class="booking-detail-label">Booked</div>
                    <div class="booking-detail-value">${new Date(booking.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
            
            ${booking.notes ? `
                <div class="booking-detail">
                    <div class="booking-detail-label">Notes</div>
                    <div class="booking-detail-value">${booking.notes}</div>
                </div>
            ` : ''}
            
            <div class="booking-actions">
                ${canCancel ? `
                    <button class="action-btn-small cancel" onclick="dashboard.cancelBooking(${booking.id})">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    }

    showQuickBookingModal() {
    const modal = document.getElementById('quickBookingModal');
    const courtSelect = document.getElementById('quickCourtSelect');
    const dateSelect = document.getElementById('quickDateSelect');
    
    if (!modal || !courtSelect || !dateSelect) return;
    
    // Reset selected slots
    this.selectedSlots = [];
    
    // Populate court options
    courtSelect.innerHTML = '<option value="">Choose a court...</option>';
    this.courts.forEach(court => {
        if (court.is_active) {
            courtSelect.innerHTML += `<option value="${court.id}">${court.name} (${court.surface_type})</option>`;
        }
    });
    
    // Set minimum date to today
    dateSelect.min = new Date().toISOString().split('T')[0];
    dateSelect.value = '';
    
    // Clear results
    document.getElementById('quickBookingSlots').innerHTML = 
        '<p class="text-muted">Select a court and date to view available slots</p>';
    document.getElementById('selectedSlotsInfo').style.display = 'none';
    
    // Remove existing event listeners
    courtSelect.removeEventListener('change', this.quickBookingHandler);
    dateSelect.removeEventListener('change', this.quickBookingHandler);
    
    // Create bound handler
    this.quickBookingHandler = () => this.updateQuickBookingSlots();
    
    // Add event listeners
    courtSelect.addEventListener('change', this.quickBookingHandler);
    dateSelect.addEventListener('change', this.quickBookingHandler);
    
    modal.classList.add('show');
}

// Updated updateQuickBookingSlots method using apiCall
async updateQuickBookingSlots() {
    const courtId = document.getElementById('quickCourtSelect')?.value;
    const date = document.getElementById('quickDateSelect')?.value;
    const slotsDiv = document.getElementById('quickBookingSlots');
    
    if (!courtId || !date || !slotsDiv) {
        if (slotsDiv) {
            slotsDiv.innerHTML = '<p class="text-muted">Select a court and date to view available slots</p>';
        }
        return;
    }

    try {
        slotsDiv.innerHTML = '<p class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading available slots...</p>';
        
        const data = await apiCall(`/api/bookings/availability?court=${courtId}&date=${date}`);
        this.displayQuickBookingSlots(data.availability, courtId, date);
    } catch (error) {
        console.error('Error loading quick booking slots:', error);
        slotsDiv.innerHTML = '<p class="text-muted">Error loading slots. Please try again.</p>';
    }
}

displayQuickBookingSlots(availability, courtId, date) {
    const slotsDiv = document.getElementById('quickBookingSlots');
    if (!slotsDiv) return;
    
    // Filter out past slots for today
    const now = new Date();
    const isToday = new Date(date).toDateString() === now.toDateString();
    
    const availableSlots = availability.filter(slot => {
        if (slot.status !== 'available') return false;
        
        if (isToday) {
            const [hours, minutes] = slot.time.split(':').map(Number);
            const slotTime = new Date();
            slotTime.setHours(hours, minutes, 0, 0);
            return slotTime > now;
        }
        return true;
    });

    if (availableSlots.length === 0) {
        slotsDiv.innerHTML = '<p class="text-muted">No available slots for the selected date</p>';
        return;
    }

    const morningSlots = availableSlots.filter(slot => {
        const [hour] = slot.time.split(':');
        return parseInt(hour) < 12;
    });

    const eveningSlots = availableSlots.filter(slot => {
        const [hour] = slot.time.split(':');
        return parseInt(hour) >= 15;
    });

    const court = this.courts.find(c => c.id == courtId);
    const courtName = court ? court.name : `Court ${courtId}`;

    let html = `<h3>Available Slots for ${courtName}</h3>`;
    html += '<p class="text-muted">Click on slots to select them. You can select up to 2 hours of consecutive slots.</p>';
    
    if (morningSlots.length > 0) {
        html += '<h4>Morning Slots (6:00 AM - 11:30 AM)</h4>';
        html += '<div class="time-slots-grid">';
        morningSlots.forEach(slot => {
            html += `<div class="court-slot available slot-selectable" data-time="${slot.time}" onclick="dashboard.toggleSlotSelection('${slot.time}')">
                ${this.formatTime(slot.time)}
            </div>`;
        });
        html += '</div>';
    }

    if (eveningSlots.length > 0) {
        html += '<h4>Evening Slots (3:00 PM - 10:00 PM)</h4>';
        html += '<div class="time-slots-grid">';
        eveningSlots.forEach(slot => {
            html += `<div class="court-slot available slot-selectable" data-time="${slot.time}" onclick="dashboard.toggleSlotSelection('${slot.time}')">
                ${this.formatTime(slot.time)}
            </div>`;
        });
        html += '</div>';
    }

    slotsDiv.innerHTML = html;
    this.selectedSlots = [];
    this.updateSelectedSlotsDisplay();
}

toggleSlotSelection(timeString) {
    const slotIndex = this.selectedSlots.indexOf(timeString);
    
    if (slotIndex > -1) {
        // Deselect slot
        this.selectedSlots.splice(slotIndex, 1);
    } else {
        // Select slot - check constraints
        if (this.canSelectSlot(timeString)) {
            this.selectedSlots.push(timeString);
        } else {
            this.showNotification('You can only select consecutive slots up to 2 hours maximum', 'warning');
            return;
        }
    }
    
    // Sort selected slots
    this.selectedSlots.sort();
    this.updateSlotVisuals();
    this.updateSelectedSlotsDisplay();
}

canSelectSlot(newSlot) {
    if (this.selectedSlots.length === 0) return true;
    
    // Check if would exceed 2 hours (4 slots of 30 minutes each)
    if (this.selectedSlots.length >= 4) return false;
    
    // Convert times to minutes for easier calculation
    const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };
    
    const allSlots = [...this.selectedSlots, newSlot].map(timeToMinutes).sort((a, b) => a - b);
    
    // Check if all slots are consecutive (30-minute intervals)
    for (let i = 1; i < allSlots.length; i++) {
        if (allSlots[i] - allSlots[i-1] !== 30) {
            return false;
        }
    }
    
    return true;
}

updateSlotVisuals() {
    document.querySelectorAll('.slot-selectable').forEach(slot => {
        const time = slot.getAttribute('data-time');
        if (this.selectedSlots.includes(time)) {
            slot.classList.add('selected');
        } else {
            slot.classList.remove('selected');
        }
    });
}

updateSelectedSlotsDisplay() {
    const infoDiv = document.getElementById('selectedSlotsInfo');
    const slotsList = document.getElementById('selectedSlotsList');
    const totalDuration = document.getElementById('totalDuration');
    const confirmBtn = document.getElementById('confirmQuickBooking');
    
    if (this.selectedSlots.length === 0) {
        infoDiv.style.display = 'none';
        return;
    }
    
    infoDiv.style.display = 'block';
    
    const sortedSlots = [...this.selectedSlots].sort();
    const startTime = this.formatTime(sortedSlots[0]);
    const endTime = this.formatTime(this.calculateEndTime(sortedSlots[sortedSlots.length - 1], 30));
    const duration = this.selectedSlots.length * 30;
    
    slotsList.innerHTML = `${startTime} - ${endTime}`;
    totalDuration.textContent = duration;
    
    confirmBtn.disabled = false;
    confirmBtn.onclick = () => this.confirmQuickBooking();
}

// Updated confirmQuickBooking method using apiCall
async confirmQuickBooking() {
    const courtId = document.getElementById('quickCourtSelect').value;
    const date = document.getElementById('quickDateSelect').value;
    const duration = this.selectedSlots.length * 30;
    const startTime = [...this.selectedSlots].sort()[0];
    
    const bookingData = {
        courtId: parseInt(courtId),
        date: date,
        startTime: startTime,
        duration: duration,
        notes: '',
        userId: this.user.id
    };
    
    try {
        const result = await apiCall('/api/bookings', {
            method: 'POST',
            body: JSON.stringify(bookingData)
        });
        
        this.showNotification('Court booked successfully!', 'success');
        closeQuickBookingModal();
        this.loadBookings();
        this.updateDashboardStats();
    } catch (error) {
        this.showNotification(`Booking failed: ${error.message}`, 'error');
    }
}

    // Updated cancelBooking method using apiCall
    async cancelBooking(bookingId) {
        const booking = this.bookings.find(b => b.id === bookingId);
        if (!booking) return;

        const court = this.courts.find(c => c.id == booking.courtId);
        const courtName = booking.courtName || (court ? court.name : `Court ${booking.courtId}`);
        const message = `Are you sure you want to cancel your booking for ${courtName} on ${new Date(booking.date).toLocaleDateString()}?`;
        
        if (!confirm(message)) return;

        try {
            console.log(`🗑️ Cancelling booking ${bookingId}...`);
            
            await apiCall(`/api/bookings/${bookingId}`, {
                method: 'DELETE'
            });

            this.showNotification('Booking cancelled successfully', 'success');
            this.loadBookings(); // Refresh bookings list
            this.updateDashboardStats();
            this.updateAvailability(); // Refresh availability if on reservations page
        } catch (error) {
            console.error('❌ Error cancelling booking:', error);
            this.showNotification(`Failed to cancel booking: ${error.message}`, 'error');
        }
    }

    filterBookings() {
        this.displayBookings();
    }

    updateDashboardStats() {
    const now = new Date();
    
    const totalBookings = this.bookings.length;
    
    const upcomingBookings = this.bookings.filter(b => {
        const bookingDate = new Date(b.date);
        const [hours, minutes] = b.startTime.split(':').map(Number);
        const startDateTime = new Date(bookingDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        const endDateTime = new Date(startDateTime.getTime() + (b.duration * 60000) + (2 * 60000));
        
        return now < endDateTime && b.status !== 'cancelled';
    }).length;
    
    const completedBookings = this.bookings.filter(b => {
        const bookingDate = new Date(b.date);
        const [hours, minutes] = b.startTime.split(':').map(Number);
        const startDateTime = new Date(bookingDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        const endDateTime = new Date(startDateTime.getTime() + (b.duration * 60000) + (2 * 60000));
        
        return b.status === 'completed' || now > endDateTime;
    }).length;

    const elements = {
        totalBookings: document.getElementById('totalBookings'),
        upcomingBookings: document.getElementById('upcomingBookings'),
        completedBookings: document.getElementById('completedBookings')
    };

    Object.entries(elements).forEach(([key, element]) => {
        if (element) {
            switch (key) {
                case 'totalBookings':
                    element.textContent = totalBookings;
                    break;
                case 'upcomingBookings':
                    element.textContent = upcomingBookings;
                    break;
                case 'completedBookings':
                    element.textContent = completedBookings;
                    break;
            }
        }
    });
    }

    updateProfileStats() {
        const memberSince = document.getElementById('memberSince');
        const totalPlayTime = document.getElementById('totalPlayTime');
        const favoriteCourt = document.getElementById('favoriteCourt');

        if (memberSince && this.user.joinDate) {
            const joinDate = new Date(this.user.joinDate);
            memberSince.textContent = joinDate.toLocaleDateString();
        }

        if (totalPlayTime) {
            // Calculate total play time from completed bookings
            const totalMinutes = this.bookings
                .filter(b => {
                    const bookingDate = new Date(b.date);
                    return b.status === 'completed' || (bookingDate < new Date() && b.status !== 'cancelled');
                })
                .reduce((sum, booking) => sum + (booking.duration || 0), 0);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            totalPlayTime.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        }

        if (favoriteCourt) {
            // Find most frequently booked court
            const courtCounts = {};
            this.bookings.forEach(booking => {
                courtCounts[booking.courtId] = (courtCounts[booking.courtId] || 0) + 1;
            });
            
            if (Object.keys(courtCounts).length > 0) {
                const favCourtId = Object.keys(courtCounts).reduce((a, b) => 
                    courtCounts[a] > courtCounts[b] ? a : b
                );
                
                const court = this.courts.find(c => c.id == favCourtId);
                favoriteCourt.textContent = court ? court.name : 'Court 1';
            } else {
                favoriteCourt.textContent = 'None yet';
            }
        }
    }

    checkAvailability() {
        this.showAvailabilityModal();
    }
    
    showAvailabilityModal() {
    const modal = document.getElementById('availabilityModal');
    const courtSelect = document.getElementById('modalCourtSelect');
    const dateSelect = document.getElementById('modalDateSelect');
    
    if (!modal || !courtSelect || !dateSelect) {
        console.error('Modal elements not found');
        return;
    }
    
    // Populate court options
    courtSelect.innerHTML = '<option value="">Choose a court...</option>';
    this.courts.forEach(court => {
        if (court.is_active) {
            courtSelect.innerHTML += `<option value="${court.id}">${court.name} (${court.surface_type})</option>`;
        }
    });
    
    // Set minimum date to today
    dateSelect.min = new Date().toISOString().split('T')[0];
    dateSelect.value = '';
    
    // Clear results
    const resultsDiv = document.getElementById('modalAvailabilityResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = '<p class="text-muted">Select a court and date to check availability</p>';
    }
    
    // Remove existing event listeners to prevent duplicates
    courtSelect.removeEventListener('change', this.modalAvailabilityHandler);
    dateSelect.removeEventListener('change', this.modalAvailabilityHandler);
    
    // Create bound handler function
    this.modalAvailabilityHandler = () => this.updateModalAvailability();
    
    // Add event listeners
    courtSelect.addEventListener('change', this.modalAvailabilityHandler);
    dateSelect.addEventListener('change', this.modalAvailabilityHandler);
    
    modal.classList.add('show');
    console.log('Availability modal opened');
}

    // Updated updateModalAvailability method using apiCall
    async updateModalAvailability() {
    const courtId = document.getElementById('modalCourtSelect')?.value;
    const date = document.getElementById('modalDateSelect')?.value;
    const resultsDiv = document.getElementById('modalAvailabilityResults');
    
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
        
        resultsDiv.innerHTML = '<p class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading availability...</p>';
        
        const data = await apiCall(`/api/bookings/availability?court=${courtId}&date=${date}`);
        this.displayModalAvailabilityResults(data.availability, courtId, date);
    } catch (error) {
        console.error('Error checking availability:', error);
        resultsDiv.innerHTML = '<p class="text-muted">Error loading availability. Please try again.</p>';
        this.showNotification('Error checking availability. Please try again.', 'error');
    }
}

    displayModalAvailabilityResults(availability, courtId, date) {
    const resultsDiv = document.getElementById('modalAvailabilityResults');
    if (!resultsDiv || !availability || availability.length === 0) {
        resultsDiv.innerHTML = '<p class="text-muted">No availability data found</p>';
        return;
    }

    const morningSlots = availability.filter(slot => {
        const [hour] = slot.time.split(':');
        return parseInt(hour) < 12;
    });

    const eveningSlots = availability.filter(slot => {
        const [hour] = slot.time.split(':');
        return parseInt(hour) >= 15;
    });

    const court = this.courts.find(c => c.id == courtId);
    const courtName = court ? court.name : `Court ${courtId}`;
    const formattedDate = new Date(date).toLocaleDateString();

    let html = `<h3>Availability for ${courtName} on ${formattedDate}</h3>`;
    
    if (morningSlots.length > 0) {
        html += '<h4>Morning Slots (6:00 AM - 11:30 AM)</h4>';
        html += '<div class="time-slots-grid">';
        morningSlots.forEach(slot => {
            html += `<div class="court-slot ${slot.status}" data-time="${slot.time}">
                ${this.formatTime(slot.time)} - ${this.capitalizeFirst(slot.status)}
            </div>`;
        });
        html += '</div>';
    }

    if (eveningSlots.length > 0) {
        html += '<h4>Evening Slots (3:00 PM - 10:00 PM)</h4>';
        html += '<div class="time-slots-grid">';
        eveningSlots.forEach(slot => {
            html += `<div class="court-slot ${slot.status}" data-time="${slot.time}">
                ${this.formatTime(slot.time)} - ${this.capitalizeFirst(slot.status)}
            </div>`;
        });
        html += '</div>';
    }

    resultsDiv.innerHTML = html;
    }

    showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            console.log(`Notification: ${message}`);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${iconMap[type]} notification-icon ${type}"></i>
                <div class="notification-text">
                    <div class="notification-message">${message}</div>
                </div>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        container.appendChild(notification);

        // Auto remove after duration
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, duration);
    }

    hideLoadingScreen() {
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }
        }, 1000);
    }
}

// Modal functions
function showModal(title, message, confirmCallback) {
    const modal = document.getElementById('confirmationModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    
    if (!modal || !modalTitle || !modalMessage || !confirmBtn) return;
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    confirmBtn.onclick = () => {
        confirmCallback();
        closeModal();
    };
    
    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('confirmationModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function closeAvailabilityModal() {
    const modal = document.getElementById('availabilityModal');
    if (modal) {
        modal.classList.remove('show');
        
        // Clean up event listeners
        const courtSelect = document.getElementById('modalCourtSelect');
        const dateSelect = document.getElementById('modalDateSelect');
        
        if (dashboard && dashboard.modalAvailabilityHandler) {
            if (courtSelect) courtSelect.removeEventListener('change', dashboard.modalAvailabilityHandler);
            if (dateSelect) dateSelect.removeEventListener('change', dashboard.modalAvailabilityHandler);
        }
    }
}

// Global functions
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        console.log('🚪 Logging out...');
        sessionStorage.removeItem('user');
        window.location.href = '/';
    }
}

function closeQuickBookingModal() {
    const modal = document.getElementById('quickBookingModal');
    if (modal) {
        modal.classList.remove('show');
        
        // Clean up event listeners
        const courtSelect = document.getElementById('quickCourtSelect');
        const dateSelect = document.getElementById('quickDateSelect');
        
        if (dashboard && dashboard.quickBookingHandler) {
            if (courtSelect) courtSelect.removeEventListener('change', dashboard.quickBookingHandler);
            if (dateSelect) dateSelect.removeEventListener('change', dashboard.quickBookingHandler);
        }
    }
}

// Global dashboard instance
let dashboard;

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎾 Tennis Court Dashboard Loading...');
    dashboard = new TennisCourtDashboard();
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.altKey) {
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    dashboard.showSection('dashboard');
                    break;
                case '2':
                    e.preventDefault();
                    dashboard.showSection('reservations');
                    break;
                case '3':
                    e.preventDefault();
                    dashboard.showSection('my-bookings');
                    break;
                case '4':
                    e.preventDefault();
                    dashboard.showSection('profile');
                    break;
            }
        }
    });
});

// Export for global access
window.dashboard = dashboard;
window.closeAvailabilityModal = closeAvailabilityModal;
window.closeQuickBookingModal = closeQuickBookingModal;