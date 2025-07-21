// Global variables
let currentUser = null;
let currentUserRole = null;
let works = JSON.parse(localStorage.getItem('works')) || [];
let currentWorkId = null;
let editingWorkId = null;
let currentFilters = {
    member: 'all',
    status: 'all',
    deadline: 'all',
    creator: 'all',
    sort: 'newest'
};

// Member avatars mapping
const memberAvatars = {
    'Irshad': 'irshad.jpg',
    'Niyas': 'niyas.jpg',
    'Muhammed': 'muhammed.jpg',
    'Najil': 'najil.jpg',
    'Safvan': 'safvan.jpg'
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
    
    updateStats();
    renderWorks();
});

// Login function
function login(name, role) {
    currentUser = name;
    currentUserRole = role;
    
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').src = memberAvatars[name];
    
    showTab('dashboard');
}

// Logout function
function logout() {
    currentUser = null;
    currentUserRole = null;
    editingWorkId = null;
    
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

// Update date and time
function updateDateTime() {
    const now = new Date();
    const timeOptions = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
    };
    const dateOptions = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('en-US', timeOptions);
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', dateOptions);
}

// Tab navigation
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active class from all nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('bg-blue-600');
        tab.classList.add('hover:bg-gray-700');
    });
    
    // Show selected tab
    document.getElementById(tabName).classList.remove('hidden');
    
    // Add active class to selected nav tab
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('bg-blue-600');
        activeTab.classList.remove('hover:bg-gray-700');
    }
    
    // Update content if needed
    if (tabName === 'works') {
        renderWorks();
    } else if (tabName === 'add-work' && !editingWorkId) {
        resetForm();
    }
}

// Submit work (Add or Edit)
function submitWork(event) {
    event.preventDefault();
    
    const workData = {
        name: document.getElementById('workName').value,
        description: document.getElementById('workDescription').value,
        whatsappNumber: document.getElementById('whatsappNumber').value,
        assignedStaff: document.getElementById('assignedStaff').value,
        deadline: document.getElementById('workDeadline').value,
        priority: document.getElementById('workPriority').value || 'medium'
    };
    
    if (editingWorkId) {
        // Update existing work
        const workIndex = works.findIndex(w => w.id === editingWorkId);
        if (workIndex !== -1) {
            works[workIndex] = {
                ...works[workIndex],
                ...workData,
                updatedBy: currentUser,
                updatedAt: new Date().toISOString()
            };
            
            alert('Work updated successfully!');
        }
        editingWorkId = null;
    } else {
        // Add new work
        const newWork = {
            id: Date.now(),
            ...workData,
            status: 'pending',
            createdBy: currentUser,
            createdAt: new Date().toISOString()
        };
        
        works.push(newWork);
        alert('Work added successfully!');
    }
    
    localStorage.setItem('works', JSON.stringify(works));
    resetForm();
    updateStats();
    showTab('works');
}

// Reset form
function resetForm() {
    document.getElementById('workName').value = '';
    document.getElementById('workDescription').value = '';
    document.getElementById('whatsappNumber').value = '';
    document.getElementById('assignedStaff').value = '';
    document.getElementById('workDeadline').value = '';
    document.getElementById('workPriority').value = 'medium';
    
    // Reset form to add mode
    editingWorkId = null;
    document.getElementById('workFormTitle').textContent = 'Add New Work';
    document.getElementById('submitBtn').innerHTML = `
        <svg class="w-4 h-4"><use href="#add-icon"/></svg>
        <span>Add Work</span>
    `;
}

// Cancel edit
function cancelEdit() {
    resetForm();
    showTab('works');
}

// Filter works by member (legacy function for compatibility)
function filterWorks(member) {
    currentFilters.member = member;
    
    // Update member filter button styles
    document.querySelectorAll('.member-filter-btn').forEach(btn => {
        btn.classList.remove('bg-gray-800', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    });
    
    event.target.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    event.target.classList.add('bg-gray-800', 'text-white');
    
    applyFilters();
}

// Apply all filters
function applyFilters() {
    // Get current filter values
    currentFilters.status = document.getElementById('statusFilter').value;
    currentFilters.deadline = document.getElementById('deadlineFilter').value;
    currentFilters.creator = document.getElementById('creatorFilter').value;
    currentFilters.sort = document.getElementById('sortFilter').value;
    
    renderWorks();
}

// Get filtered and sorted works
function getFilteredWorks() {
    let filteredWorks = [...works];
    
    // Filter by member
    if (currentFilters.member !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.assignedStaff === currentFilters.member);
    }
    
    // Filter by status
    if (currentFilters.status !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.status === currentFilters.status);
    }
    
    // Filter by creator
    if (currentFilters.creator !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.createdBy === currentFilters.creator);
    }
    
    // Filter by deadline
    if (currentFilters.deadline !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        filteredWorks = filteredWorks.filter(work => {
            if (!work.deadline) return currentFilters.deadline === 'all';
            
            const deadline = new Date(work.deadline);
            deadline.setHours(0, 0, 0, 0);
            
            switch (currentFilters.deadline) {
                case 'today':
                    return deadline.getTime() === today.getTime();
                case 'tomorrow':
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return deadline.getTime() === tomorrow.getTime();
                case 'this-week':
                    const weekEnd = new Date(today);
                    weekEnd.setDate(weekEnd.getDate() + 7);
                    return deadline >= today && deadline <= weekEnd;
                case 'overdue':
                    return deadline < today && work.status !== 'completed';
                default:
                    return true;
            }
        });
    }
    
    // Sort works
    filteredWorks.sort((a, b) => {
        switch (currentFilters.sort) {
            case 'newest':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'oldest':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'deadline':
                if (!a.deadline && !b.deadline) return 0;
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            case 'status':
                const statusOrder = { 'pending': 0, 'in-progress': 1, 'completed': 2 };
                return statusOrder[a.status] - statusOrder[b.status];
            default:
                return 0;
        }
    });
    
    return filteredWorks;
}

// Get work priority class
function getPriorityClass(priority) {
    switch (priority) {
        case 'high': return 'priority-high';
        case 'medium': return 'priority-medium';
        case 'low': return 'priority-low';
        default: return 'priority-medium';
    }
}

// Get priority badge
function getPriorityBadge(priority) {
    const priorityConfig = {
        'high': { class: 'bg-red-100 text-red-800', text: 'High Priority' },
        'medium': { class: 'bg-yellow-100 text-yellow-800', text: 'Medium Priority' },
        'low': { class: 'bg-green-100 text-green-800', text: 'Low Priority' }
    };
    
    const config = priorityConfig[priority] || priorityConfig['medium'];
    return `<span class="px-2 py-1 rounded-full text-xs font-medium ${config.class}">${config.text}</span>`;
}

// Check if deadline is today or overdue
function getDeadlineStatus(deadline) {
    if (!deadline) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    
    if (deadlineDate.getTime() === today.getTime()) {
        return { type: 'today', text: 'Due Today', class: 'bg-orange-100 text-orange-800' };
    } else if (deadlineDate < today) {
        return { type: 'overdue', text: 'Overdue', class: 'bg-red-100 text-red-800' };
    }
    
    return null;
}

// Render works list
function renderWorks() {
    const worksList = document.getElementById('worksList');
    const filteredWorks = getFilteredWorks();
    
    if (filteredWorks.length === 0) {
        worksList.innerHTML = `
            <div class="text-center py-12">
                <svg class="w-16 h-16 text-gray-400 mx-auto mb-4"><use href="#work-icon"/></svg>
                <h3 class="text-lg font-medium text-gray-900 mb-2">No works found</h3>
                <p class="text-gray-600">No works match your current filter criteria</p>
            </div>
        `;
        return;
    }
    
    worksList.innerHTML = filteredWorks.map(work => {
        const createdDate = new Date(work.createdAt).toLocaleDateString();
        const canEdit = currentUserRole === 'admin' || work.createdBy === currentUser;
        const deadlineStatus = getDeadlineStatus(work.deadline);
        const priorityClass = getPriorityClass(work.priority);
        
        return `
            <div class="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 hover:shadow-xl transition-all duration-200 card-shadow ${priorityClass}">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-3">
                    <div class="flex-1">
                        <div class="flex items-center space-x-3 mb-3">
                            <img src="${memberAvatars[work.assignedStaff]}" alt="${work.assignedStaff}" class="avatar">
                            <div>
                                <h3 class="text-lg font-bold text-gray-900">${work.name}</h3>
                                <p class="text-sm text-gray-600">Assigned to ${work.assignedStaff}</p>
                            </div>
                        </div>
                        
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="status-badge status-${work.status} px-3 py-1 rounded-full text-xs font-medium">
                                ${work.status.replace('-', ' ').toUpperCase()}
                            </span>
                            ${getPriorityBadge(work.priority)}
                            ${deadlineStatus ? `<span class="px-2 py-1 rounded-full text-xs font-medium ${deadlineStatus.class}">${deadlineStatus.text}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="flex space-x-2">
                        ${canEdit ? `
                            <button onclick="startEditWork(${work.id})" class="bg-blue-500 text-white px-3 py-2 rounded-lg text-xs hover:bg-blue-600 transition-colors flex items-center space-x-1">
                                <svg class="w-3 h-3"><use href="#edit-icon"/></svg>
                                <span>Edit</span>
                            </button>
                        ` : ''}
                        <button onclick="openWorkModal(${work.id})" class="bg-gray-500 text-white px-3 py-2 rounded-lg text-xs hover:bg-gray-600 transition-colors flex items-center space-x-1">
                            <svg class="w-3 h-3"><use href="#view-icon"/></svg>
                            <span>View</span>
                        </button>
                    </div>
                </div>
                
                <p class="text-gray-600 mb-4 text-sm line-clamp-2">${work.description || 'No description provided'}</p>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                    <div class="flex items-center space-x-2">
                        <svg class="w-4 h-4 text-gray-500"><use href="#calendar-icon"/></svg>
                        <span class="text-gray-500">Deadline:</span>
                        <span class="font-medium text-gray-900">${work.deadline ? new Date(work.deadline).toLocaleDateString() : 'No deadline'}</span>
                    </div>
                    
                    <div class="flex items-center space-x-2">
                        <img src="${memberAvatars[work.createdBy]}" alt="${work.createdBy}" class="w-4 h-4 rounded-full">
                        <span class="text-gray-500">Created by:</span>
                        <span class="font-medium text-blue-600">${work.createdBy}</span>
                    </div>
                </div>
                
                <div class="flex justify-between items-center text-xs text-gray-500 pt-3 border-t border-gray-100">
                    <span>Created on ${createdDate}</span>
                    ${work.whatsappNumber ? `
                        <button onclick="event.stopPropagation(); copyWhatsAppNumber('${work.whatsappNumber}')" class="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600 transition-colors flex items-center space-x-1">
                            <svg class="w-3 h-3"><use href="#phone-icon"/></svg>
                            <span>Copy WhatsApp</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Start editing work
function startEditWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    // Check permission
    if (currentUserRole !== 'admin' && work.createdBy !== currentUser) {
        alert('You can only edit works that you created.');
        return;
    }
    
    editingWorkId = workId;
    
    // Fill form with work data
    document.getElementById('workName').value = work.name;
    document.getElementById('workDescription').value = work.description || '';
    document.getElementById('whatsappNumber').value = work.whatsappNumber || '';
    document.getElementById('assignedStaff').value = work.assignedStaff;
    document.getElementById('workDeadline').value = work.deadline || '';
    document.getElementById('workPriority').value = work.priority || 'medium';
    
    // Update form UI
    document.getElementById('workFormTitle').textContent = 'Edit Work';
    document.getElementById('submitBtn').innerHTML = `
        <svg class="w-4 h-4"><use href="#edit-icon"/></svg>
        <span>Update Work</span>
    `;
    
    showTab('add-work');
}

// Open work modal
function openWorkModal(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    currentWorkId = workId;
    
    // Set modal content
    document.getElementById('modalWorkName').textContent = work.name;
    document.getElementById('modalDescription').textContent = work.description || 'No description provided';
    document.getElementById('modalAssigned').textContent = work.assignedStaff;
    document.getElementById('modalAssignedAvatar').src = memberAvatars[work.assignedStaff];
    document.getElementById('modalAssignedAvatarSmall').src = memberAvatars[work.assignedStaff];
    document.getElementById('modalDeadline').textContent = work.deadline ? new Date(work.deadline).toLocaleDateString() : 'No deadline';
    document.getElementById('modalCreatedBy').textContent = work.createdBy;
    document.getElementById('modalCreatorAvatar').src = memberAvatars[work.createdBy];
    document.getElementById('modalCreatedAt').textContent = new Date(work.createdAt).toLocaleDateString();
    document.getElementById('modalStatus').value = work.status;
    
    // Set priority badge
    const priorityBadge = document.getElementById('modalPriorityBadge');
    priorityBadge.innerHTML = getPriorityBadge(work.priority);
    
    // Handle WhatsApp number
    if (work.whatsappNumber) {
        document.getElementById('modalWhatsapp').classList.remove('hidden');
        document.getElementById('modalWhatsappNumber').value = work.whatsappNumber;
    } else {
        document.getElementById('modalWhatsapp').classList.add('hidden');
    }
    
    // Show/hide status update based on permissions
    const statusSection = document.getElementById('statusUpdateSection');
    const statusSelect = document.getElementById('modalStatus');
    const editBtn = document.getElementById('editWorkBtn');
    const deleteBtn = document.getElementById('deleteWorkBtn');
    
    if (currentUserRole === 'admin' || work.assignedStaff === currentUser) {
        statusSelect.disabled = false;
        statusSection.classList.remove('hidden');
    } else {
        statusSelect.disabled = true;
        statusSection.classList.add('hidden');
    }
    
    // Show/hide edit and delete buttons based on permissions
    const canEdit = currentUserRole === 'admin' || work.createdBy === currentUser;
    const canDelete = currentUserRole === 'admin' || work.createdBy === currentUser;
    
    if (canEdit) {
        editBtn.classList.remove('hidden');
    } else {
        editBtn.classList.add('hidden');
    }
    
    if (canDelete) {
        deleteBtn.classList.remove('hidden');
    } else {
        deleteBtn.classList.add('hidden');
    }
    
    // Hide actions section if no actions available
    const workActions = document.getElementById('workActions');
    if (!canEdit && !canDelete) {
        workActions.classList.add('hidden');
    } else {
        workActions.classList.remove('hidden');
    }
    
    document.getElementById('workModal').classList.remove('hidden');
}

// Edit work from modal
function editWork() {
    if (currentWorkId) {
        closeModal();
        startEditWork(currentWorkId);
    }
}

// Delete work
function deleteWork() {
    if (!currentWorkId) return;
    
    const work = works.find(w => w.id === currentWorkId);
    if (!work) return;
    
    // Check permission
    if (currentUserRole !== 'admin' && work.createdBy !== currentUser) {
        alert('You can only delete works that you created.');
        return;
    }
    
    if (confirm('Are you sure you want to delete this work? This action cannot be undone.')) {
        works = works.filter(w => w.id !== currentWorkId);
        localStorage.setItem('works', JSON.stringify(works));
        
        closeModal();
        updateStats();
        renderWorks();
        
        alert('Work deleted successfully!');
    }
}

// Close modal
function closeModal() {
    document.getElementById('workModal').classList.add('hidden');
    currentWorkId = null;
}

// Update work status
function updateWorkStatus() {
    if (!currentWorkId) return;
    
    const work = works.find(w => w.id === currentWorkId);
    if (!work) return;
    
    // Check permission
    if (currentUserRole !== 'admin' && work.assignedStaff !== currentUser) {
        alert('You can only update status of works assigned to you.');
        return;
    }
    
    const newStatus = document.getElementById('modalStatus').value;
    const workIndex = works.findIndex(w => w.id === currentWorkId);
    
    if (workIndex !== -1) {
        works[workIndex].status = newStatus;
        works[workIndex].statusUpdatedBy = currentUser;
        works[workIndex].statusUpdatedAt = new Date().toISOString();
        localStorage.setItem('works', JSON.stringify(works));
        updateStats();
        renderWorks();
        
        // Show success message
        const statusText = newStatus.replace('-', ' ').toUpperCase();
        alert(`Work status updated to ${statusText}`);
    }
}

// Copy WhatsApp number
function copyWhatsApp() {
    const number = document.getElementById('modalWhatsappNumber').value;
    copyWhatsAppNumber(number);
}

function copyWhatsAppNumber(number) {
    navigator.clipboard.writeText(number).then(() => {
        // Create temporary success message
        const button = event.target.closest('button');
        const originalHTML = button.innerHTML;
        button.innerHTML = `
            <svg class="w-3 h-3"><use href="#copy-icon"/></svg>
            <span>Copied!</span>
        `;
        button.classList.add('bg-green-600');
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('bg-green-600');
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = number;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        alert('WhatsApp number copied to clipboard!');
    });
}

// Update statistics
function updateStats() {
    const total = works.length;
    const pending = works.filter(w => w.status === 'pending').length;
    const completed = works.filter(w => w.status === 'completed').length;
    
    // Calculate works due today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueToday = works.filter(work => {
        if (!work.deadline) return false;
        const deadline = new Date(work.deadline);
        deadline.setHours(0, 0, 0, 0);
        return deadline.getTime() === today.getTime();
    }).length;
    
    document.getElementById('totalWorks').textContent = total;
    document.getElementById('pendingWorks').textContent = pending;
    document.getElementById('completedWorks').textContent = completed;
    document.getElementById('dueTodayWorks').textContent = dueToday;
}

// Add enhanced CSS
const style = document.createElement('style');
style.textContent = `
    .status-pending { background-color: #fef3c7; color: #92400e; }
    .status-in-progress { background-color: #dbeafe; color: #1e40af; }
    .status-completed { background-color: #d1fae5; color: #065f46; }
    
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    
    /* Mobile responsive improvements */
    @media (max-width: 640px) {
        .member-filter-btn {
            font-size: 12px;
            padding: 8px 12px;
        }
        
        .nav-tab {
            font-size: 14px;
            padding: 12px 16px;
        }
        
        .status-badge {
            font-size: 11px;
            padding: 4px 8px;
        }
        
        .avatar {
            width: 32px;
            height: 32px;
        }
        
        .avatar-lg {
            width: 48px;
            height: 48px;
        }
    }
    
    /* Smooth transitions */
    .card-shadow {
        transition: all 0.2s ease-in-out;
    }
    
    /* Navigation scrolling */
    .nav-tab {
        scroll-snap-align: start;
    }
    
    nav > div > div {
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
    }
    
    /* Priority indicators */
    .priority-high {
        background: linear-gradient(to right, #ef4444 0%, #ef4444 4px, #ffffff 4px);
    }
    
    .priority-medium {
        background: linear-gradient(to right, #f59e0b 0%, #f59e0b 4px, #ffffff 4px);
    }
    
    .priority-low {
        background: linear-gradient(to right, #10b981 0%, #10b981 4px, #ffffff 4px);
    }
`;
document.head.appendChild(style);
