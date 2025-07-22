// == CONFIGURATION ==
const SUPABASE_URL = 'https://icmlxulaxsacuvlkghlz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbWx4dWxheHNhY3V2bGtnaGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTk0MTgsImV4cCI6MjA2ODY5NTQxOH0.zVGLqIpCIlMoSQAInaCybz9bY1zq82IL9DC5uMs1tFQ';

// Member avatars mapping
const memberAvatars = {
    'Irshad': 'irshad.jpg',
    'Niyas': 'niyas.jpg',
    'Muhammed': 'muhammed.jpg',
    'Najil': 'najil.jpg',
    'Safvan': 'safvan.jpg'
};

// == Initialize Supabase ==
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// == Global State ==
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
let notificationsEnabled = false;

// == INITIALIZATION ==
document.addEventListener('DOMContentLoaded', async function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed'));
    }
    
    // Request notification permission
    await requestNotificationPermission();
    
    // Check if user was previously logged in
    const savedUser = localStorage.getItem('currentUser');
    const savedRole = localStorage.getItem('currentUserRole');
    
    if (savedUser && savedRole) {
        currentUser = savedUser;
        currentUserRole = savedRole;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userName').textContent = savedUser;
        document.getElementById('userAvatar').src = memberAvatars[savedUser];
        
        // Initialize app data
        await refreshWorks();
        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        
        // Set default member filter to current user (except admin)
        if (currentUserRole !== 'Administrator') {
            setDefaultMemberFilter(savedUser);
        }
        
        renderWorks();
        updateStats();
        updateMemberTiles();
        showTab('dashboard');
    }

    // Set up dropdown click handlers
    setupDropdownHandlers();
});

// == DEFAULT FILTERING ==
function setDefaultMemberFilter(username) {
    currentFilters.member = username;
    selectMemberTile(username);
}

// == DROPDOWN MANAGEMENT ==
function setupDropdownHandlers() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.custom-dropdown')) {
            closeAllDropdowns();
        }
    });
}

function closeAllDropdowns() {
    const dropdowns = [
        { element: 'statusDropdown', icon: 'statusFilterIcon' },
        { element: 'deadlineDropdown', icon: 'deadlineFilterIcon' },
        { element: 'creatorDropdown', icon: 'creatorFilterIcon' },
        { element: 'sortDropdown', icon: 'sortFilterIcon' },
        { element: 'assignStaffDropdown', icon: 'assignStaffIcon' },
        { element: 'priorityDropdown', icon: 'priorityIcon' }
    ];
    
    dropdowns.forEach(({ element, icon }) => {
        const dropdown = document.getElementById(element);
        const iconEl = document.getElementById(icon);
        if (dropdown) {
            dropdown.classList.add('hidden');
        }
        if (iconEl) {
            iconEl.style.transform = 'rotate(0deg)';
        }
    });
}

function toggleDropdown(dropdownId, iconId) {
    const dropdown = document.getElementById(dropdownId);
    const icon = document.getElementById(iconId);
    
    if (!dropdown || !icon) {
        console.error('Dropdown or icon not found:', dropdownId, iconId);
        return;
    }
    
    const isHidden = dropdown.classList.contains('hidden');
    
    // Close all other dropdowns first
    closeAllDropdowns();
    
    if (isHidden) {
        dropdown.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    }
}

// Individual dropdown toggle functions
function toggleStatusDropdown() {
    toggleDropdown('statusDropdown', 'statusFilterIcon');
}

function toggleDeadlineDropdown() {
    toggleDropdown('deadlineDropdown', 'deadlineFilterIcon');
}

function toggleCreatorDropdown() {
    toggleDropdown('creatorDropdown', 'creatorFilterIcon');
}

function toggleSortDropdown() {
    toggleDropdown('sortDropdown', 'sortFilterIcon');
}

function toggleAssignStaffDropdown() {
    toggleDropdown('assignStaffDropdown', 'assignStaffIcon');
}

function togglePriorityDropdown() {
    toggleDropdown('priorityDropdown', 'priorityIcon');
}

// == FILTER SELECTION FUNCTIONS ==
function selectStatusFilter(value) {
    currentFilters.status = value;
    document.getElementById('statusFilterText').textContent = value === 'all' ? 'All Status' : value;
    closeAllDropdowns();
    renderWorks();
}

function selectDeadlineFilter(value) {
    currentFilters.deadline = value;
    const text = {
        'all': 'All Deadlines',
        'today': 'Due Today',
        'tomorrow': 'Due Tomorrow',
        'week': 'This Week',
        'overdue': 'Overdue'
    }[value] || 'All Deadlines';
    
    document.getElementById('deadlineFilterText').textContent = text;
    closeAllDropdowns();
    renderWorks();
}

function selectCreatorFilter(value) {
    currentFilters.creator = value;
    document.getElementById('creatorFilterText').textContent = value === 'all' ? 'All Creators' : value;
    closeAllDropdowns();
    renderWorks();
}

function selectSortFilter(value) {
    currentFilters.sort = value;
    const text = {
        'newest': 'Newest First',
        'oldest': 'Oldest First',
        'deadline': 'Deadline',
        'status': 'Status'
    }[value] || 'Newest First';
    
    document.getElementById('sortFilterText').textContent = text;
    closeAllDropdowns();
    renderWorks();
}

function selectAssignStaff(value) {
    const assignStaffInput = document.getElementById('assignStaff');
    const assignStaffText = document.getElementById('assignStaffText');
    
    if (assignStaffInput && assignStaffText) {
        assignStaffInput.value = value;
        assignStaffText.textContent = value;
    }
    closeAllDropdowns();
}

function selectPriority(value) {
    const priorityInput = document.getElementById('workPriority');
    const priorityText = document.getElementById('priorityText');
    
    if (priorityInput && priorityText) {
        priorityInput.value = value;
        priorityText.textContent = value;
    }
    closeAllDropdowns();
}

// == CLEAR FILTERS ==
function clearAllFilters() {
    currentFilters = {
        member: currentUserRole === 'Administrator' ? 'all' : currentUser,
        status: 'all',
        deadline: 'all',
        creator: 'all',
        sort: 'newest'
    };
    
    // Update dropdown texts
    document.getElementById('statusFilterText').textContent = 'All Status';
    document.getElementById('deadlineFilterText').textContent = 'All Deadlines';
    document.getElementById('creatorFilterText').textContent = 'All Creators';
    document.getElementById('sortFilterText').textContent = 'Newest First';
    
    // Update member tile selection
    if (currentUserRole === 'Administrator') {
        selectMemberTile('all');
    } else {
        selectMemberTile(currentUser);
    }
    
    closeAllDropdowns();
    renderWorks();
    showToast('🔄 All filters cleared', 'info');
}

// == MEMBER TILES ==
function selectMemberTile(member) {
    // Update visual state
    document.querySelectorAll('.member-tile').forEach(tile => {
        tile.classList.remove('active');
    });
    
    // Find and activate the correct tile
    const tiles = document.querySelectorAll('.member-tile');
    tiles.forEach(tile => {
        if ((member === 'all' && tile.textContent.includes('All')) || 
            (member !== 'all' && tile.textContent.includes(member))) {
            tile.classList.add('active');
        }
    });
    
    // Update filter
    currentFilters.member = member;
    renderWorks();
}

function updateMemberTiles() {
    // Count works for each member
    const counts = {
        all: works.length,
        Irshad: works.filter(w => w.assigned_staff === 'Irshad').length,
        Niyas: works.filter(w => w.assigned_staff === 'Niyas').length,
        Muhammed: works.filter(w => w.assigned_staff === 'Muhammed').length,
        Najil: works.filter(w => w.assigned_staff === 'Najil').length,
        Safvan: works.filter(w => w.assigned_staff === 'Safvan').length
    };
    
    // Update count displays - check if elements exist
    const countElements = [
        { id: 'allCount', count: counts.all },
        { id: 'irshadCount', count: counts.Irshad },
        { id: 'niyasCount', count: counts.Niyas },
        { id: 'muhammedCount', count: counts.Muhammed },
        { id: 'najilCount', count: counts.Najil },
        { id: 'safvanCount', count: counts.Safvan }
    ];
    
    countElements.forEach(({ id, count }) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = `${count} works`;
        }
    });
}

// == DASHBOARD NAVIGATION ==
function goToWorksWithFilter(filterType) {
    showTab('works');
    
    if (filterType === 'Pending' || filterType === 'Completed') {
        selectStatusFilter(filterType);
    } else if (filterType === 'today') {
        selectDeadlineFilter('today');
    }
}

// == NOTIFICATION MANAGEMENT ==
async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        notificationsEnabled = permission === 'granted';
        if (notificationsEnabled) {
            console.log('✅ Browser notifications enabled');
        } else {
            console.log('⚠️ Browser notifications denied');
        }
    }
}

function showBrowserNotification(title, options = {}) {
    if (notificationsEnabled && 'Notification' in window) {
        new Notification(title, {
            icon: options.icon || 'logo.png',
            body: options.body || '',
            image: options.image,
            requireInteraction: false,
            ...options
        });
    }
}

function toggleNotifications() {
    if (!notificationsEnabled) {
        requestNotificationPermission().then(() => {
            if (notificationsEnabled) {
                showToast('✅ Browser notifications enabled successfully!', 'success');
            } else {
                showToast('❌ Notification permission denied', 'error');
            }
        });
    } else {
        showToast('🔔 Notifications are already enabled!', 'info');
    }
}

// == TOAST NOTIFICATIONS ==
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    const bgColor = {
        'success': 'bg-green-500',
        'error': 'bg-red-500', 
        'warning': 'bg-yellow-500',
        'info': 'bg-blue-500'
    }[type] || 'bg-blue-500';
    
    toast.className = `${bgColor} text-white px-6 py-4 rounded-lg shadow-lg animate-slide-in flex items-center gap-3 max-w-sm`;
    toast.innerHTML = `
        <div class="flex-1">${message}</div>
        <button onclick="this.parentElement.remove()" class="text-white hover:text-gray-200">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, duration);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showBrowserNotification('📋 Copied to Clipboard', {
            body: `WhatsApp number ${text} has been copied to your clipboard`,
            tag: 'clipboard'
        });
        showToast('📋 WhatsApp number copied to clipboard!', 'success');
    }).catch(() => {
        showToast('❌ Failed to copy to clipboard', 'error');
    });
}

// == USER AUTHENTICATION ==
function loginUser(name, role) {
    currentUser = name;
    currentUserRole = role;
    
    // Save login state
    localStorage.setItem('currentUser', name);
    localStorage.setItem('currentUserRole', role);
    
    // Update UI
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').src = memberAvatars[name];
    
    // Initialize app data
    refreshWorks().then(() => {
        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        
        // Set default member filter based on role
        if (role !== 'Administrator') {
            setDefaultMemberFilter(name);
        }
        
        renderWorks();
        updateStats();
        updateMemberTiles();
        showTab('dashboard');
    });
    
    showToast(`👋 Welcome back, ${name}!`, 'success');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentUserRole');
        
        currentUser = null;
        currentUserRole = null;
        works = [];
        
        // Reset filters
        currentFilters = {
            member: 'all',
            status: 'all', 
            deadline: 'all',
            creator: 'all',
            sort: 'newest'
        };
        
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        
        showToast('👋 Logged out successfully', 'info');
    }
}

// == NAVIGATION ==
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.classList.remove('bg-primary', 'text-white');
        tab.classList.add('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
    });
    
    // Show selected tab content
    const tabContent = document.getElementById(`${tabName}Content`);
    if (tabContent) {
        tabContent.classList.remove('hidden');
    }
    
    // Add active class to selected tab
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.classList.add('bg-primary', 'text-white');
        activeTab.classList.remove('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
    }
    
    if (tabName === 'works') {
        renderWorks();
        updateMemberTiles();
    }
}

// == DATE TIME ==
function updateDateTime() {
    const now = new Date();
    const options = { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
    };
    const dateTimeElement = document.getElementById('currentDateTime');
    if (dateTimeElement) {
        dateTimeElement.textContent = now.toLocaleDateString('en-US', options);
    }
}

// == WORK MANAGEMENT ==
async function refreshWorks() {
    try {
        const { data, error } = await supabase
            .from('works')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        works = data || [];
        
        renderWorks();
        updateStats();
        updateMemberTiles();
    } catch (error) {
        console.error('Error fetching works:', error);
        showToast('❌ Failed to refresh works', 'error');
    }
}

function setupMemberFilters() {
    // This function can be used for additional setup if needed
}

// == STATUS UPDATE ==
async function updateWorkStatus(workId, newStatus) {
    try {
        const { error } = await supabase
            .from('works')
            .update({ status: newStatus })
            .eq('id', workId);
        
        if (error) throw error;
        
        await refreshWorks();
        showToast('✅ Work status updated successfully!', 'success');
        
        // Show browser notification
        const work = works.find(w => w.id === workId);
        if (work) {
            showBrowserNotification('📝 Work Status Updated', {
                body: `"${work.work_name}" status changed to ${newStatus}`,
                tag: 'status-update'
            });
        }
        
    } catch (error) {
        console.error('Error updating work status:', error);
        showToast('❌ Failed to update work status', 'error');
    }
}

// == WORK DETAILS ==
function showWorkDetails(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    const modal = document.getElementById('workDetailsModal');
    const content = document.getElementById('workDetailsContent');
    
    if (!modal || !content) {
        console.error('Work details modal elements not found');
        return;
    }
    
    const statusColor = {
        'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
        'Completed': 'bg-green-100 text-green-800 border-green-200'
    }[work.status] || 'bg-gray-100 text-gray-800 border-gray-200';
    
    const priorityColor = {
        'High': 'bg-red-100 text-red-800 border-red-200',
        'Medium': 'bg-yellow-100 text-yellow-800 border-yellow-200', 
        'Low': 'bg-green-100 text-green-800 border-green-200'
    }[work.priority] || 'bg-gray-100 text-gray-800 border-gray-200';
    
    const deadline = work.deadline ? new Date(work.deadline).toLocaleDateString() : 'No deadline set';
    const createdDate = new Date(work.created_at).toLocaleDateString();
    
    content.innerHTML = `
        <div class="flex items-start gap-6 mb-6">
            <img src="${memberAvatars[work.assigned_staff]}" alt="${work.assigned_staff}" class="w-16 h-16 rounded-full object-cover ring-4 ring-primary/20">
            <div class="flex-1">
                <h3 class="text-2xl font-bold text-gray-900 mb-2">${work.work_name}</h3>
                <p class="text-gray-600 mb-3">Assigned to <span class="font-semibold">${work.assigned_staff}</span></p>
                <div class="flex flex-wrap gap-2">
                    <span class="px-3 py-1 rounded-full text-sm font-medium border ${statusColor}">${work.status}</span>
                    <span class="px-3 py-1 rounded-full text-sm font-medium border ${priorityColor}">${work.priority} Priority</span>
                </div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="bg-gray-50 p-4 rounded-xl">
                <h4 class="font-semibold text-gray-800 mb-2">📅 Deadline</h4>
                <p class="text-gray-600">${deadline}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl">
                <h4 class="font-semibold text-gray-800 mb-2">📅 Created</h4>
                <p class="text-gray-600">${createdDate} by ${work.created_by}</p>
            </div>
            ${work.whatsapp_number ? `
                <div class="bg-gray-50 p-4 rounded-xl">
                    <h4 class="font-semibold text-gray-800 mb-2">📱 WhatsApp</h4>
                    <button onclick="copyToClipboard('${work.whatsapp_number}')" class="text-green-600 hover:text-green-700 font-medium">${work.whatsapp_number}</button>
                </div>
            ` : ''}
        </div>
        
        ${work.description ? `
            <div class="bg-gray-50 p-4 rounded-xl mb-6">
                <h4 class="font-semibold text-gray-800 mb-2">📝 Description</h4>
                <p class="text-gray-600 leading-relaxed">${work.description}</p>
            </div>
        ` : ''}
        
        <div class="flex gap-3">
            <button onclick="editWork(${work.id})" class="flex-1 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
                Edit Work
            </button>
            <button onclick="deleteWork(${work.id})" class="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium">
                Delete
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function closeWorkDetailsModal() {
    const modal = document.getElementById('workDetailsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// == WORK FORM HANDLING ==
document.addEventListener('DOMContentLoaded', function() {
    const workForm = document.getElementById('workForm');
    if (workForm) {
        workForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const assignedStaff = document.getElementById('assignStaff').value;
            if (!assignedStaff) {
                showToast('❌ Please select a staff member', 'error');
                return;
            }
            
            const workData = {
                work_name: document.getElementById('workName').value,
                whatsapp_number: document.getElementById('whatsappNumber').value,
                description: document.getElementById('workDescription').value,
                assigned_staff: assignedStaff,
                deadline: document.getElementById('workDeadline').value || null,
                priority: document.getElementById('workPriority').value,
                status: 'Pending',
                created_by: currentUser
            };
            
            try {
                const { data, error } = await supabase
                    .from('works')
                    .insert([workData])
                    .select();
                
                if (error) throw error;
                
                resetForm();
                await refreshWorks();
                showTab('works');
                showToast('✅ Work added successfully!', 'success');
                
                // Show browser notification
                showBrowserNotification('📝 New Work Added', {
                    body: `"${workData.work_name}" has been assigned to ${workData.assigned_staff}`,
                    tag: 'new-work'
                });
                
            } catch (error) {
                console.error('Error adding work:', error);
                showToast('❌ Failed to add work', 'error');
            }
        });
    }
});

function resetForm() {
    const workForm = document.getElementById('workForm');
    const assignStaffText = document.getElementById('assignStaffText');
    const priorityText = document.getElementById('priorityText');
    const assignStaff = document.getElementById('assignStaff');
    const workPriority = document.getElementById('workPriority');
    
    if (workForm) {
        workForm.reset();
    }
    if (assignStaffText) {
        assignStaffText.textContent = 'Select Staff Member';
    }
    if (priorityText) {
        priorityText.textContent = 'Medium';
    }
    if (assignStaff) {
        assignStaff.value = '';
    }
    if (workPriority) {
        workPriority.value = 'Medium';
    }
}

// == EDIT WORK ==
function editWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    // Close work details modal if open
    closeWorkDetailsModal();
    
    editingWorkId = workId;
    
    // Populate edit form
    const fields = [
        { id: 'editWorkName', value: work.work_name },
        { id: 'editWhatsappNumber', value: work.whatsapp_number || '' },
        { id: 'editWorkDescription', value: work.description || '' },
        { id: 'editAssignStaff', value: work.assigned_staff },
        { id: 'editWorkStatus', value: work.status },
        { id: 'editWorkDeadline', value: work.deadline || '' },
        { id: 'editWorkPriority', value: work.priority }
    ];
    
    fields.forEach(({ id, value }) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    });
    
    // Show modal
    const modal = document.getElementById('editWorkModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeEditModal() {
    const modal = document.getElementById('editWorkModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    editingWorkId = null;
}

// Set up edit form handler
document.addEventListener('DOMContentLoaded', function() {
    const editForm = document.getElementById('editWorkForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!editingWorkId) return;
            
            const updatedWork = {
                work_name: document.getElementById('editWorkName').value,
                whatsapp_number: document.getElementById('editWhatsappNumber').value,
                description: document.getElementById('editWorkDescription').value,
                assigned_staff: document.getElementById('editAssignStaff').value,
                status: document.getElementById('editWorkStatus').value,
                deadline: document.getElementById('editWorkDeadline').value || null,
                priority: document.getElementById('editWorkPriority').value
            };
            
            try {
                const { error } = await supabase
                    .from('works')
                    .update(updatedWork)
                    .eq('id', editingWorkId);
                
                if (error) throw error;
                
                closeEditModal();
                await refreshWorks();
                showToast('✅ Work updated successfully!', 'success');
                
                // Show browser notification
                showBrowserNotification('📝 Work Updated', {
                    body: `"${updatedWork.work_name}" has been updated`,
                    tag: 'work-update'
                });
                
            } catch (error) {
                console.error('Error updating work:', error);
                showToast('❌ Failed to update work', 'error');
            }
        });
    }
});

// == DELETE WORK ==
async function deleteWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    if (confirm(`Are you sure you want to delete "${work.work_name}"?`)) {
        try {
            const { error } = await supabase
                .from('works')
                .delete()
                .eq('id', workId);
            
            if (error) throw error;
            
            closeWorkDetailsModal();
            await refreshWorks();
            showToast('🗑️ Work deleted successfully!', 'success');
            
            // Show browser notification
            showBrowserNotification('🗑️ Work Deleted', {
                body: `"${work.work_name}" has been deleted`,
                tag: 'work-delete'
            });
            
        } catch (error) {
            console.error('Error deleting work:', error);
            showToast('❌ Failed to delete work', 'error');
        }
    }
}

// == FILTERING ==
function filterWorks() {
    let filteredWorks = [...works];
    
    // Filter by member
    if (currentFilters.member !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.assigned_staff === currentFilters.member);
    }
    
    // Filter by status
    if (currentFilters.status !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.status === currentFilters.status);
    }
    
    // Filter by creator
    if (currentFilters.creator !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.created_by === currentFilters.creator);
    }
    
    // Filter by deadline
    if (currentFilters.deadline !== 'all') {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        filteredWorks = filteredWorks.filter(work => {
            if (!work.deadline) return false;
            const deadline = new Date(work.deadline);
            
            switch (currentFilters.deadline) {
                case 'today':
                    return deadline.toDateString() === today.toDateString();
                case 'tomorrow':
                    return deadline.toDateString() === tomorrow.toDateString();
                case 'week':
                    const weekFromNow = new Date(today);
                    weekFromNow.setDate(weekFromNow.getDate() + 7);
                    return deadline >= today && deadline <= weekFromNow;
                case 'overdue':
                    return deadline < today && work.status !== 'Completed';
                default:
                    return true;
            }
        });
    }
    
    // Sort works
    switch (currentFilters.sort) {
        case 'oldest':
            filteredWorks.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'deadline':
            filteredWorks.sort((a, b) => {
                if (!a.deadline && !b.deadline) return 0;
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            });
            break;
        case 'status':
            filteredWorks.sort((a, b) => a.status.localeCompare(b.status));
            break;
        case 'newest':
        default:
            filteredWorks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
    }
    
    return filteredWorks;
}

// == RENDERING ==
function renderWorks() {
    const filteredWorks = filterWorks();
    const worksTableBody = document.getElementById('worksTableBody');
    const noWorks = document.getElementById('noWorks');
    
    if (!worksTableBody || !noWorks) {
        console.error('Works table elements not found');
        return;
    }
    
    if (filteredWorks.length === 0) {
        worksTableBody.innerHTML = '';
        noWorks.classList.remove('hidden');
        return;
    }
    
    noWorks.classList.add('hidden');
    
    worksTableBody.innerHTML = filteredWorks.map(work => {
        const statusColor = {
            'Pending': 'bg-yellow-100 text-yellow-800',
            'In Progress': 'bg-blue-100 text-blue-800',
            'Completed': 'bg-green-100 text-green-800'
        }[work.status] || 'bg-gray-100 text-gray-800';
        
        const deadline = work.deadline ? new Date(work.deadline).toLocaleDateString() : 'No deadline';
        const createdDate = new Date(work.created_at).toLocaleDateString();
        
        return `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="showWorkDetails(${work.id})">
                <td class="px-6 py-4">
                    <div class="flex flex-col gap-2">
                        <div class="text-sm font-medium text-gray-900">${work.work_name}</div>
                        <div class="flex items-center gap-3">
                            <img src="${memberAvatars[work.assigned_staff]}" alt="${work.assigned_staff}" class="w-8 h-8 rounded-full object-cover">
                            <div>
                                <div class="text-sm font-medium text-gray-700">${work.assigned_staff}</div>
                                <div class="text-xs text-gray-500">${work.description ? work.description.substring(0, 30) + '...' : 'No description'}</div>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="status-dropdown" onclick="event.stopPropagation()">
                        <select onchange="updateWorkStatus(${work.id}, this.value)" class="status-button ${statusColor} border-0 cursor-pointer">
                            <option value="Pending" ${work.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="In Progress" ${work.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${work.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        </select>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${deadline}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <img src="${memberAvatars[work.created_by]}" alt="${work.created_by}" class="w-6 h-6 rounded-full object-cover">
                        <span class="text-sm text-gray-900">${work.created_by}</span>
                    </div>
                    <div class="text-xs text-gray-500">${createdDate}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap" onclick="event.stopPropagation()">
                    ${work.whatsapp_number ? 
                        `<button onclick="copyToClipboard('${work.whatsapp_number}')" class="text-green-600 hover:text-green-900 text-sm font-medium hover:underline">${work.whatsapp_number}</button>` : 
                        '<span class="text-gray-400 text-sm">No number</span>'
                    }
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium" onclick="event.stopPropagation()">
                    <div class="flex gap-2">
                        <button onclick="editWork(${work.id})" class="text-indigo-600 hover:text-indigo-900 hover:underline">Edit</button>
                        <button onclick="deleteWork(${work.id})" class="text-red-600 hover:text-red-900 hover:underline">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStats() {
    const totalWorks = works.length;
    const pendingWorks = works.filter(work => work.status === 'Pending').length;
    const completedWorks = works.filter(work => work.status === 'Completed').length;
    
    const today = new Date().toDateString();
    const dueTodayWorks = works.filter(work => 
        work.deadline && new Date(work.deadline).toDateString() === today && work.status !== 'Completed'
    ).length;
    
    // Update stats with null checks
    const statElements = [
        { id: 'totalWorks', value: totalWorks },
        { id: 'pendingWorks', value: pendingWorks },
        { id: 'completedWorks', value: completedWorks },
        { id: 'dueTodayWorks', value: dueTodayWorks }
    ];
    
    statElements.forEach(({ id, value }) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

// == REAL-TIME SUBSCRIPTIONS ==
function subscribeToWorks() {
    supabase
        .channel('works')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'works' }, 
            (payload) => {
                console.log('Work change received:', payload);
                refreshWorks();
                
                // Show notifications for changes
                if (payload.eventType === 'INSERT') {
                    showBrowserNotification('📝 New Work Added', {
                        body: `"${payload.new.work_name}" assigned to ${payload.new.assigned_staff}`,
                        tag: 'new-work'
                    });
                } else if (payload.eventType === 'UPDATE') {
                    showBrowserNotification('📝 Work Updated', {
                        body: `"${payload.new.work_name}" status changed to ${payload.new.status}`,
                        tag: 'work-update'
                    });
                }
            }
        )
        .subscribe();
}

function subscribeToNotifications() {
    supabase
        .channel('notifications')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser}` }, 
            (payload) => {
                console.log('Notification received:', payload);
                const notification = payload.new;
                
                showBrowserNotification(notification.title, {
                    body: notification.message,
                    tag: notification.type
                });
                
                showToast(`🔔 ${notification.message}`, 'info');
            }
        )
        .subscribe();
}
