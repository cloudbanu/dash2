

const { createClient } = supabase;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// Global variables
let currentUser = null;
let currentUserRole = null;
let works = [];
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
    
    // Check if a user is already "logged in" from a previous session
    const storedUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (storedUser) {
        login(storedUser.name, storedUser.role);
    }
});

// Login function
async function login(name, role) {
    try {
        currentUser = name;
        currentUserRole = role;
        
        // Store user session
        sessionStorage.setItem('currentUser', JSON.stringify({ name, role }));
        
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userName').textContent = name;
        document.getElementById('userAvatar').src = memberAvatars[name];
        
        showTab('dashboard');
        await fetchAllWorks(); // Fetch data from Supabase on login
        updateStats();
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
    }
}

// Logout function
function logout() {
    currentUser = null;
    currentUserRole = null;
    editingWorkId = null;
    works = [];
    
    sessionStorage.removeItem('currentUser');
    
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

// --- DATABASE (SUPABASE) FUNCTIONS ---

// Fetch all works from Supabase
async function fetchAllWorks() {
    try {
        const { data, error } = await supabaseClient
            .from('works')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching works:', error);
            alert('Could not fetch data from the server. Please check your connection.');
            return;
        }
        
        works = data || [];
        renderWorks();
        updateStats();
    } catch (error) {
        console.error('Network error:', error);
        alert('Network error. Please check your internet connection.');
    }
}

// Submit work (Add or Edit)
async function submitWork(event) {
    event.preventDefault();
    
    try {
        const workData = {
            name: document.getElementById('workName').value,
            description: document.getElementById('workDescription').value,
            whatsapp_number: document.getElementById('whatsappNumber').value || null,
            assigned_staff: document.getElementById('assignedStaff').value,
            deadline: document.getElementById('workDeadline').value || null,
            priority: document.getElementById('workPriority').value || 'medium'
        };
        
        if (editingWorkId) {
            // Update existing work
            workData.updated_by = currentUser;
            workData.updated_at = new Date().toISOString();
            
            const { error } = await supabaseClient
                .from('works')
                .update(workData)
                .eq('id', editingWorkId);
                
            if (error) {
                console.error('Error updating work:', error);
                alert('Failed to update work: ' + error.message);
                return;
            }
            
            alert('Work updated successfully!');
            editingWorkId = null;
        } else {
            // Add new work
            workData.created_by = currentUser;
            workData.status = 'pending';

            const { error } = await supabaseClient
                .from('works')
                .insert([workData]);

            if (error) {
                console.error('Error adding work:', error);
                alert('Failed to add work: ' + error.message);
                return;
            }
            
            alert('Work added successfully!');
        }
        
        resetForm();
        await fetchAllWorks(); // Re-fetch all data
        showTab('works');
    } catch (error) {
        console.error('Submit work error:', error);
        alert('An error occurred. Please try again.');
    }
}

// Delete work
async function deleteWork() {
    if (!currentWorkId) return;
    
    try {
        const work = works.find(w => w.id === currentWorkId);
        if (!work) return;
        
        // Permission check
        if (currentUserRole !== 'admin' && work.created_by !== currentUser) {
            alert('You do not have permission to delete this work.');
            return;
        }
        
        if (confirm('Are you sure you want to delete this work? This action cannot be undone.')) {
            const { error } = await supabaseClient
                .from('works')
                .delete()
                .eq('id', currentWorkId);
                
            if (error) {
                console.error('Error deleting work:', error);
                alert('Failed to delete work: ' + error.message);
                return;
            }
            
            closeModal();
            await fetchAllWorks();
            alert('Work deleted successfully!');
        }
    } catch (error) {
        console.error('Delete work error:', error);
        alert('An error occurred while deleting. Please try again.');
    }
}

// Update work status
async function updateWorkStatus() {
    if (!currentWorkId) return;
    
    try {
        const work = works.find(w => w.id === currentWorkId);
        if (!work) return;
        
        // Permission check
        if (currentUserRole !== 'admin' && work.assigned_staff !== currentUser) {
            alert('You can only update the status of works assigned to you.');
            document.getElementById('modalStatus').value = work.status; // Revert UI
            return;
        }
        
        const newStatus = document.getElementById('modalStatus').value;
        
        const { error } = await supabaseClient
            .from('works')
            .update({ 
                status: newStatus, 
                updated_by: currentUser,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentWorkId);
            
        if (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status: ' + error.message);
            return;
        }
        
        await fetchAllWorks();
        const statusText = newStatus.replace('-', ' ').toUpperCase();
        alert(`Work status updated to ${statusText}`);
    } catch (error) {
        console.error('Update status error:', error);
        alert('An error occurred while updating status. Please try again.');
    }
}

// --- UI AND HELPER FUNCTIONS ---

// Update date and time
function updateDateTime() {
    const now = new Date();
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('en-US', timeOptions);
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', dateOptions);
}

// Tab navigation
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('bg-blue-600');
        tab.classList.add('hover:bg-gray-700');
    });
    document.getElementById(tabName).classList.remove('hidden');
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('bg-blue-600');
        activeTab.classList.remove('hover:bg-gray-700');
    }
    if (tabName === 'works') renderWorks();
    else if (tabName === 'add-work' && !editingWorkId) resetForm();
}

// Reset form
function resetForm() {
    document.getElementById('workName').value = '';
    document.getElementById('workDescription').value = '';
    document.getElementById('whatsappNumber').value = '';
    document.getElementById('assignedStaff').value = '';
    document.getElementById('workDeadline').value = '';
    document.getElementById('workPriority').value = 'medium';
    editingWorkId = null;
    document.getElementById('workFormTitle').textContent = 'Add New Work';
    document.getElementById('submitBtn').innerHTML = `<svg class="w-4 h-4"><use href="#add-icon"/></svg><span>Add Work</span>`;
}

// Cancel edit
function cancelEdit() {
    resetForm();
    showTab('works');
}

// Filter works by member
function filterWorks(member) {
    currentFilters.member = member;
    document.querySelectorAll('.member-filter-btn').forEach(btn => {
        btn.classList.remove('bg-gray-800', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    });
    event.target.closest('button').classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    event.target.closest('button').classList.add('bg-gray-800', 'text-white');
    applyFilters();
}

// Apply all filters
function applyFilters() {
    currentFilters.status = document.getElementById('statusFilter').value;
    currentFilters.deadline = document.getElementById('deadlineFilter').value;
    currentFilters.creator = document.getElementById('creatorFilter').value;
    currentFilters.sort = document.getElementById('sortFilter').value;
    renderWorks();
}

// Get filtered and sorted works
function getFilteredWorks() {
    let filteredWorks = [...works];
    if (currentFilters.member !== 'all') filteredWorks = filteredWorks.filter(work => work.assigned_staff === currentFilters.member);
    if (currentFilters.status !== 'all') filteredWorks = filteredWorks.filter(work => work.status === currentFilters.status);
    if (currentFilters.creator !== 'all') filteredWorks = filteredWorks.filter(work => work.created_by === currentFilters.creator);
    
    if (currentFilters.deadline !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filteredWorks = filteredWorks.filter(work => {
            if (!work.deadline) return false;
            const deadline = new Date(work.deadline);
            deadline.setHours(0, 0, 0, 0);
            switch (currentFilters.deadline) {
                case 'today': return deadline.getTime() === today.getTime();
                case 'tomorrow':
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return deadline.getTime() === tomorrow.getTime();
                case 'this-week':
                    const weekEnd = new Date(today);
                    weekEnd.setDate(weekEnd.getDate() + 7);
                    return deadline >= today && deadline <= weekEnd;
                case 'overdue': return deadline < today && work.status !== 'completed';
                default: return true;
            }
        });
    }

    filteredWorks.sort((a, b) => {
        switch (currentFilters.sort) {
            case 'newest': return new Date(b.created_at) - new Date(a.created_at);
            case 'oldest': return new Date(a.created_at) - new Date(b.created_at);
            case 'deadline':
                if (!a.deadline) return 1; if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            case 'status':
                const statusOrder = { 'pending': 0, 'in-progress': 1, 'completed': 2 };
                return statusOrder[a.status] - statusOrder[b.status];
            default: return 0;
        }
    });
    return filteredWorks;
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
        const createdDate = new Date(work.created_at).toLocaleDateString();
        const canEdit = currentUserRole === 'admin' || work.created_by === currentUser;
        const deadlineStatus = getDeadlineStatus(work.deadline);
        const priorityClass = getPriorityClass(work.priority);
        
        return `
            <div class="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 hover:shadow-xl transition-all duration-200 card-shadow ${priorityClass}">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-3">
                    <div class="flex-1">
                        <div class="flex items-center space-x-3 mb-3">
                            <img src="${memberAvatars[work.assigned_staff]}" alt="${work.assigned_staff}" class="avatar">
                            <div>
                                <h3 class="text-lg font-bold text-gray-900">${work.name}</h3>
                                <p class="text-sm text-gray-600">Assigned to ${work.assigned_staff}</p>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="status-badge status-${work.status} px-3 py-1 rounded-full text-xs font-medium">${work.status.replace('-', ' ').toUpperCase()}</span>
                            ${getPriorityBadge(work.priority)}
                            ${deadlineStatus ? `<span class="px-2 py-1 rounded-full text-xs font-medium ${deadlineStatus.class}">${deadlineStatus.text}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        ${canEdit ? `<button onclick="startEditWork(${work.id})" class="bg-blue-500 text-white px-3 py-2 rounded-lg text-xs hover:bg-blue-600 flex items-center space-x-1"><svg class="w-3 h-3"><use href="#edit-icon"/></svg><span>Edit</span></button>` : ''}
                        <button onclick="openWorkModal(${work.id})" class="bg-gray-500 text-white px-3 py-2 rounded-lg text-xs hover:bg-gray-600 flex items-center space-x-1"><svg class="w-3 h-3"><use href="#view-icon"/></svg><span>View</span></button>
                    </div>
                </div>
                <p class="text-gray-600 mb-4 text-sm line-clamp-2">${work.description || 'No description'}</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                    <div class="flex items-center space-x-2"><svg class="w-4 h-4 text-gray-500"><use href="#calendar-icon"/></svg><span>Deadline:</span><span class="font-medium">${work.deadline ? new Date(work.deadline).toLocaleDateString() : 'N/A'}</span></div>
                    <div class="flex items-center space-x-2"><img src="${memberAvatars[work.created_by]}" alt="${work.created_by}" class="w-4 h-4 rounded-full"><span>Created by:</span><span class="font-medium text-blue-600">${work.created_by}</span></div>
                </div>
                <div class="flex justify-between items-center text-xs text-gray-500 pt-3 border-t border-gray-100">
                    <span>Created on ${createdDate}</span>
                    ${work.whatsapp_number ? `<button onclick="event.stopPropagation(); copyWhatsAppNumber('${work.whatsapp_number}')" class="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600 flex items-center space-x-1"><svg class="w-3 h-3"><use href="#phone-icon"/></svg><span>Copy WhatsApp</span></button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Start editing work
function startEditWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    if (currentUserRole !== 'admin' && work.created_by !== currentUser) {
        alert('You can only edit works that you created.');
        return;
    }
    editingWorkId = workId;
    document.getElementById('workName').value = work.name;
    document.getElementById('workDescription').value = work.description || '';
    document.getElementById('whatsappNumber').value = work.whatsapp_number || '';
    document.getElementById('assignedStaff').value = work.assigned_staff;
    document.getElementById('workDeadline').value = work.deadline || '';
    document.getElementById('workPriority').value = work.priority || 'medium';
    document.getElementById('workFormTitle').textContent = 'Edit Work';
    document.getElementById('submitBtn').innerHTML = `<svg class="w-4 h-4"><use href="#edit-icon"/></svg><span>Update Work</span>`;
    showTab('add-work');
}

// Open work modal
function openWorkModal(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    currentWorkId = workId;
    document.getElementById('modalWorkName').textContent = work.name;
    document.getElementById('modalDescription').textContent = work.description || 'No description';
    document.getElementById('modalAssigned').textContent = work.assigned_staff;
    document.getElementById('modalAssignedAvatar').src = memberAvatars[work.assigned_staff];
    document.getElementById('modalAssignedAvatarSmall').src = memberAvatars[work.assigned_staff];
    document.getElementById('modalDeadline').textContent = work.deadline ? new Date(work.deadline).toLocaleDateString() : 'N/A';
    document.getElementById('modalCreatedBy').textContent = work.created_by;
    document.getElementById('modalCreatorAvatar').src = memberAvatars[work.created_by];
    document.getElementById('modalCreatedAt').textContent = new Date(work.created_at).toLocaleDateString();
    document.getElementById('modalStatus').value = work.status;
    document.getElementById('modalPriorityBadge').innerHTML = getPriorityBadge(work.priority);

    if (work.whatsapp_number) {
        document.getElementById('modalWhatsapp').classList.remove('hidden');
        document.getElementById('modalWhatsappNumber').value = work.whatsapp_number;
    } else {
        document.getElementById('modalWhatsapp').classList.add('hidden');
    }

    const statusSection = document.getElementById('statusUpdateSection');
    const statusSelect = document.getElementById('modalStatus');
    const editBtn = document.getElementById('editWorkBtn');
    const deleteBtn = document.getElementById('deleteWorkBtn');
    
    if (currentUserRole === 'admin' || work.assigned_staff === currentUser) {
        statusSelect.disabled = false;
        statusSection.classList.remove('hidden');
    } else {
        statusSelect.disabled = true;
        statusSection.classList.add('hidden');
    }

    const canModify = currentUserRole === 'admin' || work.created_by === currentUser;
    editBtn.classList.toggle('hidden', !canModify);
    deleteBtn.classList.toggle('hidden', !canModify);
    document.getElementById('workActions').classList.toggle('hidden', !canModify);
    
    document.getElementById('workModal').classList.remove('hidden');
}

// Edit work from modal
function editWork() {
    if (currentWorkId) {
        closeModal();
        startEditWork(currentWorkId);
    }
}

// Close modal
function closeModal() {
    document.getElementById('workModal').classList.add('hidden');
    currentWorkId = null;
}

// Copy WhatsApp number
function copyWhatsApp() {
    const number = document.getElementById('modalWhatsappNumber').value;
    copyWhatsAppNumber(number);
}

function copyWhatsAppNumber(number) {
    navigator.clipboard.writeText(number).then(() => {
        const button = event.target.closest('button');
        const originalHTML = button.innerHTML;
        button.innerHTML = `<svg class="w-3 h-3"><use href="#copy-icon"/></svg><span>Copied!</span>`;
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

// --- UTILITY FUNCTIONS ---
function getPriorityClass(priority) {
    switch (priority) {
        case 'high': return 'priority-high';
        case 'medium': return 'priority-medium';
        case 'low': return 'priority-low';
        default: return 'priority-medium';
    }
}

function getPriorityBadge(priority) {
    const priorityConfig = {
        'high': { class: 'bg-red-100 text-red-800', text: 'High Priority' },
        'medium': { class: 'bg-yellow-100 text-yellow-800', text: 'Medium Priority' },
        'low': { class: 'bg-green-100 text-green-800', text: 'Low Priority' }
    };
    
    const config = priorityConfig[priority] || priorityConfig['medium'];
    return `<span class="px-2 py-1 rounded-full text-xs font-medium ${config.class}">${config.text}</span>`;
}

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
