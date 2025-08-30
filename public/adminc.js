// Admin Create Reservations System

// Add this at the very top - REPLACE the existing getApiBaseUrl function
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

class AdminCreateReservations {
    constructor() {
        this.members = [];
        this.coachings = [];
        this.courts = [];
        this.selectedSlots = [];
        this.selectedMember = null;
        this.selectedCoaching = null;
        this.bookingType = 'member';
        this.availability = [];
        
        this.init();
        this.coachingManager = new CoachingManager(this);
    }

    init() {
        console.log('🎾 Initializing Admin Create Reservations...');
        this.setupEventListeners();
        this.loadInitialData();
        this.updateCurrentTime();
        this.setMinDate();
        this.hideLoadingOverlay();
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadMembers(),
                this.loadCoachings(),
                this.loadCourts()
            ]);
            console.log('✅ Initial data loaded successfully');
        } catch (error) {
            console.error('❌ Error loading initial data:', error);
            this.showNotification('Error loading initial data', 'error');
        }
    }

    async loadMembers() {
        try {
            const data = await apiCall('/api/members');
            this.members = data.members;
            console.log(`✅ Loaded ${this.members.length} members`);
        } catch (error) {
            console.error('❌ Error loading members:', error);
            throw error;
        }
    }

    async loadCoachings() {
        try {
            const data = await apiCall('/api/coachings');
            this.coachings = data.coachings;
            console.log(`✅ Loaded ${this.coachings.length} coaching groups`);
        } catch (error) {
            console.error('❌ Error loading coachings:', error);
            throw error;
        }
    }

    async loadCourts() {
        try {
            const data = await apiCall('/api/courts/all');
            this.courts = data.courts.filter(court => court.is_active);
            this.populateCourtSelect();
            console.log(`✅ Loaded ${this.courts.length} active courts`);
        } catch (error) {
            console.error('❌ Error loading courts:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Booking type change
        document.querySelectorAll('input[name="booking-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleBookingTypeChange(e.target.value));
        });

        // Member search
        const memberSearch = document.getElementById('member-search');
        if (memberSearch) {
            memberSearch.addEventListener('input', (e) => this.handleMemberSearch(e.target.value));
            memberSearch.addEventListener('focus', () => this.showMemberDropdown());
        }

        // Coaching search
        const coachingSearch = document.getElementById('coaching-search');
        if (coachingSearch) {
            coachingSearch.addEventListener('input', (e) => this.handleCoachingSearch(e.target.value));
            coachingSearch.addEventListener('focus', () => this.showCoachingDropdown());
        }

        // Court and date selection
        const courtSelect = document.getElementById('admin-court-select');
        const dateInput = document.getElementById('admin-booking-date');

        if (courtSelect) {
            courtSelect.addEventListener('change', () => this.updateAvailability());
        }

        if (dateInput) {
            dateInput.addEventListener('change', () => this.updateAvailability());
        }

        // Form submission
        const form = document.getElementById('admin-booking-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideAllDropdowns();
            }
        });
    }

    switchTab(tabName) {
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
        
        // Load coaching data when coaching tab is selected
        if (tabName === 'coaching') {
            this.coachingManager.loadCoachingsForTab();
        }
    }

    handleBookingTypeChange(type) {
        this.bookingType = type;
        console.log(`Booking type changed to: ${type}`);

        // Toggle selection groups
        document.getElementById('member-selection').classList.toggle('active', type === 'member');
        document.getElementById('coaching-selection').classList.toggle('active', type === 'coaching');

        // Clear selections
        this.selectedMember = null;
        this.selectedCoaching = null;
        this.updateSelectedDisplay();
        this.validateForm();
    }

    handleMemberSearch(query) {
        if (!query || query.length < 2) {
            this.hideMemberDropdown();
            return;
        }

        const filtered = this.members.filter(member => 
            member.name.toLowerCase().includes(query.toLowerCase()) ||
            member.membershipId.toLowerCase().includes(query.toLowerCase()) ||
            member.email.toLowerCase().includes(query.toLowerCase())
        );

        this.displayMemberResults(filtered);
    }

    displayMemberResults(members) {
        const dropdown = document.getElementById('member-dropdown');
        if (!dropdown) return;

        if (members.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item">No members found</div>';
        } else {
            dropdown.innerHTML = members.map(member => `
                <div class="dropdown-item" onclick="adminReservations.selectMember(${member.id})">
                    <strong>${member.name}</strong><br>
                    <small>${member.membershipId} - ${member.email}</small>
                </div>
            `).join('');
        }

        dropdown.classList.add('show');
    }

    selectMember(memberId) {
        const member = this.members.find(m => m.id === memberId);
        if (!member) return;

        this.selectedMember = member;
        document.getElementById('member-search').value = member.name;
        this.hideMemberDropdown();
        this.updateSelectedDisplay();
        this.validateForm();
    }

    handleCoachingSearch(query) {
        if (!query || query.length < 2) {
            this.hideCoachingDropdown();
            return;
        }

        const filtered = this.coachings.filter(coaching => 
            coaching.groupName.toLowerCase().includes(query.toLowerCase()) ||
            coaching.coachName.toLowerCase().includes(query.toLowerCase())
        );

        this.displayCoachingResults(filtered);
    }

    displayCoachingResults(coachings) {
        const dropdown = document.getElementById('coaching-dropdown');
        if (!dropdown) return;

        if (coachings.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item">No coaching groups found</div>';
        } else {
            dropdown.innerHTML = coachings.map(coaching => `
                <div class="dropdown-item" onclick="adminReservations.selectCoaching(${coaching.id})">
                    <strong>${coaching.groupName}</strong><br>
                    <small>Coach: ${coaching.coachName}</small>
                </div>
            `).join('');
        }

        dropdown.classList.add('show');
    }

    selectCoaching(coachingId) {
        const coaching = this.coachings.find(c => c.id === coachingId);
        if (!coaching) return;

        this.selectedCoaching = coaching;
        document.getElementById('coaching-search').value = coaching.groupName;
        this.hideCoachingDropdown();
        this.updateSelectedDisplay();
        this.validateForm();
    }

    showMemberDropdown() {
        if (this.members.length > 0) {
            this.displayMemberResults(this.members.slice(0, 10)); // Show first 10
        }
    }

    showCoachingDropdown() {
        if (this.coachings.length > 0) {
            this.displayCoachingResults(this.coachings);
        }
    }

    hideMemberDropdown() {
        const dropdown = document.getElementById('member-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    }

    hideCoachingDropdown() {
        const dropdown = document.getElementById('coaching-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    }

    hideAllDropdowns() {
        this.hideMemberDropdown();
        this.hideCoachingDropdown();
    }

    updateSelectedDisplay() {
        const memberSelected = document.getElementById('selected-member');
        const coachingSelected = document.getElementById('selected-coaching');

        if (this.selectedMember && this.bookingType === 'member') {
            memberSelected.innerHTML = `
                <div class="selected-info">
                    <strong>${this.selectedMember.name}</strong><br>
                    <small>${this.selectedMember.membershipId} - ${this.selectedMember.email}</small>
                </div>
                <button type="button" class="remove-btn" onclick="adminReservations.clearMemberSelection()">Remove</button>
            `;
            memberSelected.classList.add('show');
        } else {
            memberSelected.classList.remove('show');
        }

        if (this.selectedCoaching && this.bookingType === 'coaching') {
            coachingSelected.innerHTML = `
                <div class="selected-info">
                    <strong>${this.selectedCoaching.groupName}</strong><br>
                    <small>Coach: ${this.selectedCoaching.coachName}</small>
                </div>
                <button type="button" class="remove-btn" onclick="adminReservations.clearCoachingSelection()">Remove</button>
            `;
            coachingSelected.classList.add('show');
        } else {
            coachingSelected.classList.remove('show');
        }
    }

    clearMemberSelection() {
        this.selectedMember = null;
        document.getElementById('member-search').value = '';
        this.updateSelectedDisplay();
        this.validateForm();
    }

    clearCoachingSelection() {
        this.selectedCoaching = null;
        document.getElementById('coaching-search').value = '';
        this.updateSelectedDisplay();
        this.validateForm();
    }

    populateCourtSelect() {
        const select = document.getElementById('admin-court-select');
        if (!select) return;

        select.innerHTML = '<option value="">Choose a court...</option>';
        this.courts.forEach(court => {
            select.innerHTML += `<option value="${court.id}">${court.name} (${court.surface_type})</option>`;
        });
    }

    async updateAvailability() {
        const courtId = document.getElementById('admin-court-select')?.value;
        const date = document.getElementById('admin-booking-date')?.value;
        
        if (!courtId || !date) {
            this.clearSlotsGrid();
            return;
        }

        try {
            console.log(`Checking availability for Court ${courtId} on ${date}`);
            
            const data = await apiCall(`/api/bookings/availability?court=${courtId}&date=${date}`);
            this.availability = data.availability;
            this.displayAvailableSlots();
            this.validateForm();
        } catch (error) {
            console.error('Error checking availability:', error);
            this.showNotification('Error checking availability. Please try again.', 'error');
        }
    }

    displayAvailableSlots() {
        const slotsGrid = document.getElementById('admin-slots-grid');
        if (!slotsGrid || !this.availability || this.availability.length === 0) {
            this.clearSlotsGrid();
            return;
        }

        const now = new Date();
        const selectedDate = new Date(document.getElementById('admin-booking-date').value);
        const isToday = selectedDate.toDateString() === now.toDateString();

        // Filter out past slots for today
        const availableSlots = this.availability.filter(slot => {
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
            slotsGrid.innerHTML = '<p class="text-muted">No available slots for the selected date</p>';
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

        let html = '';

        if (morningSlots.length > 0) {
            html += '<h4>Morning Slots (6:00 AM - 11:30 AM)</h4>';
            html += '<div class="slots-grid">';
            morningSlots.forEach(slot => {
                html += `<div class="court-slot available" data-time="${slot.time}" onclick="adminReservations.toggleSlotSelection('${slot.time}')">
                    ${this.formatTime(slot.time)}
                </div>`;
            });
            html += '</div>';
        }

        if (eveningSlots.length > 0) {
            html += '<h4>Evening Slots (3:00 PM - 10:00 PM)</h4>';
            html += '<div class="slots-grid">';
            eveningSlots.forEach(slot => {
                html += `<div class="court-slot available" data-time="${slot.time}" onclick="adminReservations.toggleSlotSelection('${slot.time}')">
                    ${this.formatTime(slot.time)}
                </div>`;
            });
            html += '</div>';
        }

        slotsGrid.innerHTML = html;
        this.selectedSlots = [];
        this.updateSelectedSlotsDisplay();
    }

    toggleSlotSelection(timeString) {
        const slotIndex = this.selectedSlots.indexOf(timeString);
        
        if (slotIndex > -1) {
            // Deselect slot
            this.selectedSlots.splice(slotIndex, 1);
        } else {
            // Select slot - check constraints (no time limit for admin)
            if (this.canSelectSlot(timeString)) {
                this.selectedSlots.push(timeString);
            } else {
                this.showNotification('You can only select consecutive slots', 'warning');
                return;
            }
        }
        
        // Sort selected slots
        this.selectedSlots.sort();
        this.updateSlotVisuals();
        this.updateSelectedSlotsDisplay();
        this.validateForm();
    }

    canSelectSlot(newSlot) {
        if (this.selectedSlots.length === 0) return true;
        
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
        document.querySelectorAll('.court-slot').forEach(slot => {
            const time = slot.getAttribute('data-time');
            if (this.selectedSlots.includes(time)) {
                slot.classList.add('selected');
            } else {
                slot.classList.remove('selected');
            }
        });
    }

    updateSelectedSlotsDisplay() {
        const infoDiv = document.getElementById('selected-slots-info');
        const slotsList = document.getElementById('selected-slots-list');
        const totalDuration = document.getElementById('total-duration');
        
        if (this.selectedSlots.length === 0) {
            infoDiv.style.display = 'none';
            return;
        }
        
        infoDiv.style.display = 'block';
        
        const sortedSlots = [...this.selectedSlots].sort();
        const startTime = this.formatTime(sortedSlots[0]);
        const endTime = this.formatTime(this.calculateEndTime(sortedSlots[sortedSlots.length - 1], 30));
        const duration = this.selectedSlots.length * 30;
        
        slotsList.textContent = `${startTime} - ${endTime}`;
        totalDuration.textContent = duration;
    }

    formatTime(timeString) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }

    calculateEndTime(startTime, duration) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const startMinutes = hours * 60 + minutes;
        const endMinutes = startMinutes + duration;
        const endHours = Math.floor(endMinutes / 60);
        const endMins = endMinutes % 60;
        return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    }

    clearSlotsGrid() {
        const slotsGrid = document.getElementById('admin-slots-grid');
        if (slotsGrid) {
            slotsGrid.innerHTML = '<p class="text-muted">Select court and date to view available slots</p>';
        }
        this.selectedSlots = [];
        this.updateSelectedSlotsDisplay();
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        if (!this.validateForm()) {
            this.showNotification('Please fill all required fields', 'error');
            return;
        }

        const courtId = document.getElementById('admin-court-select').value;
        const date = document.getElementById('admin-booking-date').value;
        const notes = document.getElementById('admin-booking-notes').value;
        const startTime = [...this.selectedSlots].sort()[0];
        const duration = this.selectedSlots.length * 30;

        const bookingData = {
            courtId: parseInt(courtId),
            date: date,
            startTime: startTime,
            duration: duration,
            notes: notes || null,
            bookingType: this.bookingType
        };

        if (this.bookingType === 'member') {
            bookingData.userId = this.selectedMember.id;
        } else {
            bookingData.coachingId = this.selectedCoaching.id;
        }

        try {
            this.showLoadingOverlay();
            console.log('Creating reservation:', bookingData);

            const result = await apiCall('/api/admin/bookings', {
                method: 'POST',
                body: JSON.stringify(bookingData)
            });

            this.showNotification('Reservation created successfully!', 'success');
            this.resetForm();
        } catch (error) {
            console.error('Error creating reservation:', error);
            this.showNotification(`Failed to create reservation: ${error.message}`, 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    validateForm() {
        const courtSelected = document.getElementById('admin-court-select').value;
        const dateSelected = document.getElementById('admin-booking-date').value;
        const slotsSelected = this.selectedSlots.length > 0;
        
        let entitySelected = false;
        if (this.bookingType === 'member') {
            entitySelected = this.selectedMember !== null;
        } else {
            entitySelected = this.selectedCoaching !== null;
        }

        const isValid = courtSelected && dateSelected && slotsSelected && entitySelected;
        
        const submitBtn = document.getElementById('create-reservation-btn');
        if (submitBtn) {
            submitBtn.disabled = !isValid;
        }

        return isValid;
    }

    resetForm() {
        // Reset form fields
        document.getElementById('admin-booking-form').reset();
        
        // Reset selections
        this.selectedMember = null;
        this.selectedCoaching = null;
        this.selectedSlots = [];
        
        // Reset booking type to member
        document.getElementById('member-type').checked = true;
        this.bookingType = 'member';
        this.handleBookingTypeChange('member');
        
        // Clear displays
        this.updateSelectedDisplay();
        this.clearSlotsGrid();
        
        // Reset date minimum
        this.setMinDate();
        
        console.log('Form reset successfully');
    }

    setMinDate() {
        const dateInput = document.getElementById('admin-booking-date');
        if (dateInput) {
            dateInput.min = new Date().toISOString().split('T')[0];
        }
    }

    updateCurrentTime() {
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString();
        }
        
        setTimeout(() => this.updateCurrentTime(), 1000);
    }

    showLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
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

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, duration);
    }
}

// Initialize the admin reservations system
let adminReservations;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin Create Reservations Loading...');
    adminReservations = new AdminCreateReservations();
});

// Export for global access
window.adminReservations = adminReservations;

class CoachingManager {
    constructor(parentClass) {
        this.parent = parentClass;
        this.coachings = [];
        this.editingCoachingId = null;
        this.setupCoachingEventListeners();
    }

    setupCoachingEventListeners() {
        // Add coaching button
        const addBtn = document.getElementById('add-coaching-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showCoachingModal());
        }

        // Modal close events
        const closeModal = document.getElementById('close-coaching-modal');
        const cancelBtn = document.getElementById('cancel-coaching-btn');
        const modal = document.getElementById('coaching-modal');

        if (closeModal) {
            closeModal.addEventListener('click', () => this.hideCoachingModal());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideCoachingModal());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideCoachingModal();
                }
            });
        }

        // Form submission
        const form = document.getElementById('coaching-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleCoachingFormSubmit(e));
        }
    }

    async loadCoachingsForTab() {
        try {
            console.log('Loading coaching groups for management...');
            this.showCoachingLoading();

            const data = await apiCall('/api/coachings/all');
            this.coachings = data.coachings;
            this.displayCoachings();
            console.log(`✅ Loaded ${this.coachings.length} coaching groups`);
        } catch (error) {
            console.error('❌ Error loading coaching groups:', error);
            this.showCoachingError('Failed to load coaching groups');
        }
    }

    displayCoachings() {
        const container = document.getElementById('coaching-list');
        if (!container) return;

        if (this.coachings.length === 0) {
            container.innerHTML = `
                <div class="coaching-empty">
                    <i class="fas fa-graduation-cap"></i>
                    <h3>No Coaching Groups</h3>
                    <p>Start by adding your first coaching group</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.coachings.map(coaching => `
            <div class="coaching-card" data-coaching-id="${coaching.id}">
                <div class="coaching-card-header">
                    <div class="coaching-title">
                        <h3>${this.escapeHtml(coaching.groupName)}</h3>
                        <p class="coaching-coach">Coach: ${this.escapeHtml(coaching.coachName)}</p>
                    </div>
                    <div class="coaching-actions">
                        <button class="btn btn-sm btn-primary" onclick="coachingManager.editCoaching(${coaching.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm ${coaching.isActive ? 'btn-warning' : 'btn-success'}" 
                                onclick="coachingManager.toggleCoachingStatus(${coaching.id}, ${!coaching.isActive})">
                            <i class="fas ${coaching.isActive ? 'fa-pause' : 'fa-play'}"></i> 
                            ${coaching.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </div>
                
                ${coaching.description ? `
                    <div class="coaching-description">${this.escapeHtml(coaching.description)}</div>
                ` : `
                    <div class="coaching-description empty">No description provided</div>
                `}
                
                <div class="coaching-info">
                    <div class="max-participants">
                        <i class="fas fa-users"></i>
                        Max: ${coaching.maxParticipants} participants
                    </div>
                    <div class="coaching-status">
                        <span class="status-badge ${coaching.isActive ? 'active' : 'inactive'}">
                            ${coaching.isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    showCoachingModal(coaching = null) {
        const modal = document.getElementById('coaching-modal');
        const title = document.getElementById('coaching-modal-title');
        const form = document.getElementById('coaching-form');
        
        if (!modal || !title || !form) return;

        this.editingCoachingId = coaching ? coaching.id : null;
        
        if (coaching) {
            title.textContent = 'Edit Coaching Group';
            document.getElementById('coaching-id').value = coaching.id;
            document.getElementById('group-name').value = coaching.groupName;
            document.getElementById('coach-name').value = coaching.coachName;
            document.getElementById('group-description').value = coaching.description || '';
            document.getElementById('max-participants').value = coaching.maxParticipants;
        } else {
            title.textContent = 'Add Coaching Group';
            form.reset();
            document.getElementById('coaching-id').value = '';
            document.getElementById('max-participants').value = '10'; // Default value
        }

        modal.style.display = 'flex';
        document.getElementById('group-name').focus();
    }

    hideCoachingModal() {
        const modal = document.getElementById('coaching-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.editingCoachingId = null;
    }

    async handleCoachingFormSubmit(e) {
        e.preventDefault();
        
        const formData = {
            groupName: document.getElementById('group-name').value.trim(),
            coachName: document.getElementById('coach-name').value.trim(),
            description: document.getElementById('group-description').value.trim() || null,
            maxParticipants: parseInt(document.getElementById('max-participants').value)
        };

        // Validation
        if (!formData.groupName || !formData.coachName) {
            this.parent.showNotification('Group name and coach name are required', 'error');
            return;
        }

        if (formData.maxParticipants < 1 || formData.maxParticipants > 20) {
            this.parent.showNotification('Max participants must be between 1 and 20', 'error');
            return;
        }

        try {
            this.parent.showLoadingOverlay();
            
            const url = this.editingCoachingId ? 
                `/api/coachings/${this.editingCoachingId}` : 
                '/api/coachings';
            
            const method = this.editingCoachingId ? 'PUT' : 'POST';
            
            const result = await apiCall(url, {
                method: method,
                body: JSON.stringify(formData)
            });

            const action = this.editingCoachingId ? 'updated' : 'created';
            this.parent.showNotification(`Coaching group ${action} successfully!`, 'success');
            this.hideCoachingModal();
            await this.loadCoachingsForTab(); // Reload the list
        } catch (error) {
            console.error('Error saving coaching group:', error);
            this.parent.showNotification(`Failed to save coaching group: ${error.message}`, 'error');
        } finally {
            this.parent.hideLoadingOverlay();
        }
    }

    async editCoaching(coachingId) {
        const coaching = this.coachings.find(c => c.id === coachingId);
        if (coaching) {
            this.showCoachingModal(coaching);
        }
    }

    async toggleCoachingStatus(coachingId, newStatus) {
        try {
            this.parent.showLoadingOverlay();
            
            const result = await apiCall(`/api/coachings/${coachingId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ isActive: newStatus })
            });

            const action = newStatus ? 'activated' : 'deactivated';
            this.parent.showNotification(`Coaching group ${action} successfully!`, 'success');
            await this.loadCoachingsForTab(); // Reload the list
        } catch (error) {
            console.error('Error updating coaching status:', error);
            this.parent.showNotification(`Failed to update status: ${error.message}`, 'error');
        } finally {
            this.parent.hideLoadingOverlay();
        }
    }

    showCoachingLoading() {
        const container = document.getElementById('coaching-list');
        if (container) {
            container.innerHTML = `
                <div class="coaching-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    Loading coaching groups...
                </div>
            `;
        }
    }

    showCoachingError(message) {
        const container = document.getElementById('coaching-list');
        if (container) {
            container.innerHTML = `
                <div class="coaching-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error Loading Coaching Groups</h3>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="coachingManager.loadCoachingsForTab()">
                        <i class="fas fa-sync-alt"></i> Try Again
                    </button>
                </div>
            `;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

let coachingManager;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin Create Reservations Loading...');
    adminReservations = new AdminCreateReservations();
    
    // Make coaching manager globally accessible
    window.coachingManager = adminReservations.coachingManager;
});
