
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
let categories = [];
let currentWorkId = null;
let editingWorkId = null;
let deleteWorkId = null;
let currentFilters = {
    member: 'all',
    status: 'all', 
    deadline: 'all',
    creator: 'all',
    category: 'all',
    sort: 'overdue_pending'
};
let notificationsEnabled = false;
let hasUnsavedChanges = false;
let pendingModalClose = null;

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
    
    // Set up keyboard event listeners
    setupKeyboardEventListeners();
    
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
        await Promise.all([
            refreshWorks(),
            refreshCategories()
        ]);
        
        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        
        // Set default member filter based on role
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
    
    // Set up form handlers
    setupFormHandlers();
});

// == KEYBOARD EVENT LISTENERS ==
function setupKeyboardEventListeners() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Close any open modals with Esc key
            if (!document.getElementById('workDetailsModal').classList.contains('hidden')) {
                closeWorkDetailsModal();
            } else if (!document.getElementById('editWorkModal').classList.contains('hidden')) {
                closeEditModal();
            } else if (!document.getElementById('addCategoryModal').classList.contains('hidden')) {
                closeAddCategoryModal();
            } else if (!document.getElementById('deleteConfirmModal').classList.contains('hidden')) {
                closeDeleteConfirmModal();
            } else if (!document.getElementById('logoutConfirmModal').classList.contains('hidden')) {
                closeLogoutConfirmModal();
            } else if (!document.getElementById('unsavedChangesModal').classList.contains('hidden')) {
                closeUnsavedChangesModal();
            } else {
                // Close dropdowns
                closeAllDropdowns();
            }
        }
    });
}

// == UNSAVED CHANGES TRACKING ==
function trackChanges() {
    const forms = ['workForm', 'editWorkForm', 'addCategoryForm'];
    
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.addEventListener('input', () => {
                    hasUnsavedChanges = true;
                });
                input.addEventListener('change', () => {
                    hasUnsavedChanges = true;
                });
            });
        }
    });
}

function resetUnsavedChanges() {
    hasUnsavedChanges = false;
}

// == MODAL CLOSE HANDLERS ==
function closeWorkDetailsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    
    const modal = document.getElementById('workDetailsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeEditModal(event) {
    if (event && event.target !== event.currentTarget) return;
    
    if (hasUnsavedChanges) {
        pendingModalClose = 'editWorkModal';
        showUnsavedChangesModal();
        return;
    }
    
    const modal = document.getElementById('editWorkModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    editingWorkId = null;
    resetUnsavedChanges();
}

function closeAddCategoryModal(event) {
    if (event && event.target !== event.currentTarget) return;
    
    if (hasUnsavedChanges) {
        pendingModalClose = 'addCategoryModal';
        showUnsavedChangesModal();
        return;
    }
    
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.getElementById('addCategoryForm').reset();
    resetUnsavedChanges();
}

// == CONFIRMATION MODALS ==
function showDeleteConfirmation(workId, workName) {
    deleteWorkId = workId;
    document.getElementById('deleteConfirmText').textContent = 
        `Are you sure you want to delete "${workName}"? This action cannot be undone.`;
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
}

function closeDeleteConfirmModal() {
    document.getElementById('deleteConfirmModal').classList.add('hidden');
    deleteWorkId = null;
}

function confirmDelete() {
    if (deleteWorkId) {
        executeDeleteWork(deleteWorkId);
    }
    closeDeleteConfirmModal();
}

function showLogoutConfirmation() {
    document.getElementById('logoutConfirmModal').classList.remove('hidden');
}

function closeLogoutConfirmModal() {
    document.getElementById('logoutConfirmModal').classList.add('hidden');
}

function confirmLogout() {
    executeLogout();
    closeLogoutConfirmModal();
}

function showUnsavedChangesModal() {
    document.getElementById('unsavedChangesModal').classList.remove('hidden');
}

function closeUnsavedChangesModal() {
    document.getElementById('unsavedChangesModal').classList.add('hidden');
    pendingModalClose = null;
}

function discardChanges() {
    resetUnsavedChanges();
    closeUnsavedChangesModal();
    
    if (pendingModalClose) {
        const modal = document.getElementById(pendingModalClose);
        if (modal) {
            modal.classList.add('hidden');
        }
        
        if (pendingModalClose === 'editWorkModal') {
            editingWorkId = null;
        } else if (pendingModalClose === 'addCategoryModal') {
            document.getElementById('addCategoryForm').reset();
        }
        
        pendingModalClose = null;
    }
}

// == CATEGORIES MANAGEMENT ==
async function refreshCategories() {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) throw error;
        categories = data || [];
        
        populateCategoryDropdowns();
    } catch (error) {
        console.error('Error fetching categories:', error);
        showToast('❌ Failed to refresh categories', 'error');
    }
}

function populateCategoryDropdowns() {
    // Populate add work category dropdown
    const categoryOptions = document.getElementById('categoryOptions');
    if (categoryOptions) {
        categoryOptions.innerHTML = '';
        categories.forEach(category => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.onclick = () => selectCategory(category.name);
            div.innerHTML = `
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                </svg>
                ${category.name}
            `;
            categoryOptions.appendChild(div);
        });
    }
    
    // Populate edit work category dropdown
    const editCategoryDropdown = document.getElementById('editWorkCategory');
    if (editCategoryDropdown) {
        editCategoryDropdown.innerHTML = '';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.name;
            option.textContent = category.name;
            editCategoryDropdown.appendChild(option);
        });
    }
    
    // Populate category filter dropdown
    const categoryFilterItems = document.getElementById('categoryFilterItems');
    if (categoryFilterItems) {
        categoryFilterItems.innerHTML = '';
        categories.forEach(category => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.onclick = () => selectCategoryFilter(category.name);
            div.innerHTML = `
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                </svg>
                ${category.name}
            `;
            categoryFilterItems.appendChild(div);
        });
    }
}

function filterCategories(searchTerm) {
    const categoryOptions = document.getElementById('categoryOptions');
    if (!categoryOptions) return;
    
    const filteredCategories = categories.filter(category => 
        category.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    categoryOptions.innerHTML = '';
    filteredCategories.forEach(category => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.onclick = () => selectCategory(category.name);
        div.innerHTML = `
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
            </svg>
            ${category.name}
        `;
        categoryOptions.appendChild(div);
    });
}

function selectCategory(categoryName) {
    document.getElementById('workCategory').value = categoryName;
    document.getElementById('categoryText').textContent = categoryName;
    document.getElementById('categorySearch').value = '';
    closeAllDropdowns();
    filterCategories(''); // Reset filter
}

function selectCategoryFilter(categoryName) {
    currentFilters.category = categoryName;
    document.getElementById('categoryFilterText').textContent = categoryName;
    closeAllDropdowns();
    renderWorks();
}

// == CATEGORY MODAL FUNCTIONS ==
function showAddCategoryModal() {
    closeAllDropdowns();
    resetUnsavedChanges();
    document.getElementById('addCategoryModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('newCategoryName').focus();
        trackChanges();
    }, 100);
}

// == FORM HANDLERS ==
function setupFormHandlers() {
    // Work form handler
    const workForm = document.getElementById('workForm');
    if (workForm) {
        workForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const assignedStaff = document.getElementById('assignStaff').value;
            const category = document.getElementById('workCategory').value;
            
            if (!assignedStaff) {
                showToast('❌ Please select a staff member', 'error');
                return;
            }
            
            if (!category) {
                showToast('❌ Please select a category', 'error');
                return;
            }
            
            const workData = {
                work_name: document.getElementById('workName').value,
                category: category,
                whatsapp_number: document.getElementById('whatsappNumber').value,
                description: document.getElementById('workDescription').value,
                assigned_staff: assignedStaff,
                deadline: document.getElementById('workDeadline').value || null,
                deadline_time: document.getElementById('workDeadlineTime').value || null,
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
                resetUnsavedChanges();
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
    
    // Add category form handler
    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const categoryName = document.getElementById('newCategoryName').value.trim();
            
            if (!categoryName) {
                showToast('❌ Please enter a category name', 'error');
                return;
            }
            
            // Check if category already exists
            const existingCategory = categories.find(cat => 
                cat.name.toLowerCase() === categoryName.toLowerCase()
            );
            
            if (existingCategory) {
                showToast('❌ Category already exists', 'error');
                return;
            }
            
            try {
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{
                        name: categoryName,
                        created_by: currentUser
                    }])
                    .select();
                
                if (error) throw error;
                
                await refreshCategories();
                selectCategory(categoryName);
                
                document.getElementById('addCategoryModal').classList.add('hidden');
                document.getElementById('addCategoryForm').reset();
                resetUnsavedChanges();
                showToast('✅ Category added successfully!', 'success');
                
            } catch (error) {
                console.error('Error adding category:', error);
                showToast('❌ Failed to add category', 'error');
            }
        });
    }
    
    // Edit work form handler
    const editWorkForm = document.getElementById('editWorkForm');
    if (editWorkForm) {
        editWorkForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!editingWorkId) return;
            
            const updatedWork = {
                work_name: document.getElementById('editWorkName').value,
                category: document.getElementById('editWorkCategory').value,
                whatsapp_number: document.getElementById('editWhatsappNumber').value,
                description: document.getElementById('editWorkDescription').value,
                mrp: parseFloat(document.getElementById('editWorkMrp').value) || null,
                quotation_rate: parseFloat(document.getElementById('editWorkQuotationRate').value) || null,
                assigned_staff: document.getElementById('editAssignStaff').value,
                status: document.getElementById('editWorkStatus').value,
                deadline: document.getElementById('editWorkDeadline').value || null,
                deadline_time: document.getElementById('editWorkDeadlineTime').value || null,
                priority: document.getElementById('editWorkPriority').value
            };
            
            try {
                const { error } = await supabase
                    .from('works')
                    .update(updatedWork)
                    .eq('id', editingWorkId);
                
                if (error) throw error;
                
                closeEditModal();
                resetUnsavedChanges();
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

    // Set up change tracking
    setTimeout(trackChanges, 100);
}

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
        { element: 'categoryDropdown', icon: 'categoryFilterIcon' },
        { element: 'deadlineDropdown', icon: 'deadlineFilterIcon' },
        { element: 'creatorDropdown', icon: 'creatorFilterIcon' },
        { element: 'sortDropdown', icon: 'sortFilterIcon' },
        { element: 'assignStaffDropdown', icon: 'assignStaffIcon' },
        { element: 'priorityDropdown', icon: 'priorityIcon' },
        { element: 'categorySearchDropdown', icon: 'categoryIcon' }
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

function toggleCategoryDropdown() {
    toggleDropdown('categoryDropdown', 'categoryFilterIcon');
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

function toggleCategorySearchDropdown() {
    toggleDropdown('categorySearchDropdown', 'categoryIcon');
    // Focus on search input when opened
    setTimeout(() => {
        const searchInput = document.getElementById('categorySearch');
        if (searchInput) {
            searchInput.focus();
        }
    }, 100);
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
        'overdue_pending': 'Overdue & Pending First',
        'newest': 'Newest First',
        'oldest': 'Oldest First',
        'deadline': 'Deadline',
        'status': 'Status'
    }[value] || 'Overdue & Pending First';
    
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

// == CANCEL ADD WORK ==
function cancelAddWork() {
    resetForm();
    resetUnsavedChanges();
    showTab('dashboard');
}

// == CLEAR FILTERS ==
function clearAllFilters() {
    currentFilters = {
        member: currentUserRole === 'Administrator' ? 'all' : currentUser,
        status: 'all',
        deadline: 'all',
        creator: 'all',
        category: 'all',
        sort: 'overdue_pending'
    };
    
    // Update dropdown texts
    document.getElementById('statusFilterText').textContent = 'All Status';
    document.getElementById('categoryFilterText').textContent = 'All Categories';
    document.getElementById('creatorFilterText').textContent = 'All Creators';
    document.getElementById('sortFilterText').textContent = 'Overdue & Pending First';
    
    // Update member tile selection
    if (currentUserRole === 'Administrator') {
        selectMemberTile('all');
    } else {
        selectMemberTile(currentUser);
    }
    
    closeAllDropdowns();
    renderWorks();
    updateMemberTiles();
    updateStats();
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
    } else if (filterType === 'all') {
        // For total works tile - show all works
        selectStatusFilter('all');
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
    Promise.all([
        refreshWorks(),
        refreshCategories()
    ]).then(() => {
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

function executeLogout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserRole');
    
    currentUser = null;
    currentUserRole = null;
    works = [];
    categories = [];
    resetUnsavedChanges();
    
    // Reset filters
    currentFilters = {
        member: 'all',
        status: 'all', 
        deadline: 'all',
        creator: 'all',
        category: 'all',
        sort: 'overdue_pending'
    };
    
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    
    showToast('👋 Logged out successfully', 'info');
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
    const deadlineTime = work.deadline_time || 'No time set';
    const createdDate = new Date(work.created_at).toLocaleDateString();
    const categoryDisplay = work.category || 'No category';
    
    content.innerHTML = `
        <div class="space-y-6">
            <!-- Work Header -->
            <div class="text-center border-b border-gray-200 pb-6">
                <h3 class="text-3xl font-bold text-gray-900 mb-4">${work.work_name}</h3>
                <div class="flex justify-center items-center gap-3 mb-4">
                    <span class="px-4 py-2 rounded-full text-sm font-medium border ${statusColor}">${work.status}</span>
                    <span class="px-4 py-2 rounded-full text-sm font-medium border ${priorityColor}">${work.priority} Priority</span>
                    <span class="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
                        <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                        </svg>
                        ${categoryDisplay}
                    </span>
                </div>
            </div>

            <!-- Assigned Staff Section -->
            <div class="text-center">
                <p class="text-sm text-gray-600 mb-2">Assigned to</p>
                <div class="flex justify-center items-center gap-3">
                    <img src="${memberAvatars[work.assigned_staff]}" alt="${work.assigned_staff}" class="w-16 h-16 rounded-full object-cover ring-4 ring-primary/20">
                    <div class="text-left">
                        <div class="text-xl font-semibold text-gray-900">${work.assigned_staff}</div>
                        <div class="text-sm text-gray-500">Team Member</div>
                    </div>
                </div>
            </div>
            
            <!-- Work Details Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-gray-50 p-4 rounded-xl">
                    <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a4 4 0 118 0v4m-4 8a4 4 0 11-8 0v-1a2 2 0 012-2h4a2 2 0 012 2v1z"></path>
                        </svg>
                        Deadline
                    </h4>
                    <p class="text-gray-700 font-medium">${deadline}</p>
                    <p class="text-sm text-gray-600">${deadlineTime}</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-xl">
                    <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        Created
                    </h4>
                    <p class="text-gray-700 font-medium">${createdDate}</p>
                    <p class="text-sm text-gray-600">by ${work.created_by}</p>
                </div>
                ${work.whatsapp_number ? `
                    <div class="bg-gray-50 p-4 rounded-xl">
                        <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893A11.821 11.821 0 0020.485 3.105"></path>
                            </svg>
                            WhatsApp
                        </h4>
                        <button onclick="copyToClipboard('${work.whatsapp_number}')" class="text-green-600 hover:text-green-700 font-medium hover:underline">${work.whatsapp_number}</button>
                    </div>
                ` : ''}
                ${work.mrp || work.quotation_rate ? `
                    <div class="bg-gray-50 p-4 rounded-xl">
                        <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                            </svg>
                            Pricing
                        </h4>
                        ${work.mrp ? `<p class="text-gray-700">MRP: ₹${work.mrp}</p>` : ''}
                        ${work.quotation_rate ? `<p class="text-gray-700">Quote: ₹${work.quotation_rate}</p>` : ''}
                    </div>
                ` : ''}
            </div>
            
            ${work.description ? `
                <div class="bg-gray-50 p-6 rounded-xl">
                    <h4 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Description
                    </h4>
                    <p class="text-gray-700 leading-relaxed">${work.description}</p>
                </div>
            ` : ''}
            
            <!-- Action Buttons -->
            <div class="flex gap-3 pt-4 border-t border-gray-200">
                <button onclick="editWork(${work.id})" class="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                    </svg>
                    Edit Work
                </button>
                <button onclick="deleteWork(${work.id})" class="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function resetForm() {
    const workForm = document.getElementById('workForm');
    const categoryText = document.getElementById('categoryText');
    const assignStaffText = document.getElementById('assignStaffText');
    const priorityText = document.getElementById('priorityText');
    const workCategory = document.getElementById('workCategory');
    const assignStaff = document.getElementById('assignStaff');
    const workPriority = document.getElementById('workPriority');
    const categorySearch = document.getElementById('categorySearch');
    
    if (workForm) {
        workForm.reset();
    }
    if (categoryText) {
        categoryText.textContent = 'Select Category';
    }
    if (assignStaffText) {
        assignStaffText.textContent = 'Select Staff Member';
    }
    if (priorityText) {
        priorityText.textContent = 'Medium';
    }
    if (workCategory) {
        workCategory.value = '';
    }
    if (assignStaff) {
        assignStaff.value = '';
    }
    if (workPriority) {
        workPriority.value = 'Medium';
    }
    if (categorySearch) {
        categorySearch.value = '';
        filterCategories('');
    }
}

// == EDIT WORK ==
function editWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    // Close work details modal if open
    closeWorkDetailsModal();
    
    editingWorkId = workId;
    resetUnsavedChanges();
    
    // Populate edit form
    const fields = [
        { id: 'editWorkName', value: work.work_name },
        { id: 'editWorkCategory', value: work.category || '' },
        { id: 'editWhatsappNumber', value: work.whatsapp_number || '' },
        { id: 'editWorkDescription', value: work.description || '' },
        { id: 'editWorkMrp', value: work.mrp || '' },
        { id: 'editWorkQuotationRate', value: work.quotation_rate || '' },
        { id: 'editAssignStaff', value: work.assigned_staff },
        { id: 'editWorkStatus', value: work.status },
        { id: 'editWorkDeadline', value: work.deadline || '' },
        { id: 'editWorkDeadlineTime', value: work.deadline_time || '' },
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
        setTimeout(trackChanges, 100);
    }
}

// == DELETE WORK ==
function deleteWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    closeWorkDetailsModal();
    showDeleteConfirmation(workId, work.work_name);
}

async function executeDeleteWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    try {
        const { error } = await supabase
            .from('works')
            .delete()
            .eq('id', workId);
        
        if (error) throw error;
        
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
    
    // Filter by category
    if (currentFilters.category !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.category === currentFilters.category);
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
    
    // Enhanced sorting with overdue and pending priority
    switch (currentFilters.sort) {
        case 'overdue_pending':
            filteredWorks.sort((a, b) => {
                const today = new Date();
                const aOverdue = a.deadline && new Date(a.deadline) < today && a.status !== 'Completed';
                const bOverdue = b.deadline && new Date(b.deadline) < today && b.status !== 'Completed';
                const aPending = a.status === 'Pending';
                const bPending = b.status === 'Pending';
                const aDueToday = a.deadline && new Date(a.deadline).toDateString() === today.toDateString();
                const bDueToday = b.deadline && new Date(b.deadline).toDateString() === today.toDateString();
                
                // Priority order: overdue, due today, pending, others
                if (aOverdue !== bOverdue) return bOverdue - aOverdue;
                if (aDueToday !== bDueToday) return bDueToday - aDueToday;
                if (aPending !== bPending) return bPending - aPending;
                
                // Secondary sort by creation date (newest first)
                return new Date(b.created_at) - new Date(a.created_at);
            });
            break;
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

// == ENHANCED CARD-BASED RENDERING (Without Description) ==
function renderWorks() {
    const filteredWorks = filterWorks();
    const worksContainer = document.getElementById('worksCardsContainer');
    const noWorks = document.getElementById('noWorks');
    
    if (!worksContainer || !noWorks) {
        console.error('Works container elements not found');
        return;
    }
    
    if (filteredWorks.length === 0) {
        worksContainer.innerHTML = '';
        noWorks.classList.remove('hidden');
        return;
    }
    
    noWorks.classList.add('hidden');
    
    worksContainer.innerHTML = filteredWorks.map(work => {
        const statusColor = {
            'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
            'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
            'Completed': 'bg-green-100 text-green-800 border-green-200'
        }[work.status] || 'bg-gray-100 text-gray-800 border-gray-200';
        
        const priorityColor = {
            'High': 'bg-red-100 text-red-800',
            'Medium': 'bg-yellow-100 text-yellow-800',
            'Low': 'bg-green-100 text-green-800'
        }[work.priority] || 'bg-gray-100 text-gray-800';
        
        const deadline = work.deadline ? new Date(work.deadline).toLocaleDateString() : null;
        const deadlineTime = work.deadline_time || null;
        const createdDate = new Date(work.created_at).toLocaleDateString();
        const categoryDisplay = work.category || 'No Category';
        const isOverdue = work.deadline && new Date(work.deadline) < new Date() && work.status !== 'Completed';
        const isDueToday = work.deadline && new Date(work.deadline).toDateString() === new Date().toDateString();
        
        return `
            <div class="work-card p-6" onclick="showWorkDetails(${work.id})">
                <!-- Work Header -->
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h3 class="text-xl font-semibold text-gray-900 mb-2 line-clamp-2">${work.work_name}</h3>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                </svg>
                                ${categoryDisplay}
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 ml-4">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${priorityColor}">${work.priority}</span>
                        ${isOverdue ? '<span class="px-2 py-1 rounded-full text-xs font-medium bg-red-500 text-white">Overdue</span>' : ''}
                        ${isDueToday && !isOverdue ? '<span class="px-2 py-1 rounded-full text-xs font-medium bg-orange-500 text-white">Due Today</span>' : ''}
                    </div>
                </div>

                <!-- Assigned Staff -->
                <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                    <img src="${memberAvatars[work.assigned_staff]}" alt="${work.assigned_staff}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <div class="text-sm font-medium text-gray-900">${work.assigned_staff}</div>
                        <div class="text-xs text-gray-500">Assigned Staff</div>
                    </div>
                </div>

                <!-- Status and Actions -->
                <div class="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div class="status-dropdown" onclick="event.stopPropagation()">
                        <select onchange="updateWorkStatus(${work.id}, this.value)" class="px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${statusColor}">
                            <option value="Pending" ${work.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="In Progress" ${work.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${work.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        </select>
                    </div>
                    
                    <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                        ${work.whatsapp_number ? `
                            <button onclick="copyToClipboard('${work.whatsapp_number}')" class="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full transition-colors" title="Copy WhatsApp: ${work.whatsapp_number}">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893A11.821 11.821 0 0020.485 3.105"></path>
                                </svg>
                            </button>
                        ` : ''}
                        
                        <button onclick="editWork(${work.id})" class="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-colors" title="Edit Work">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                            </svg>
                        </button>
                        
                        <button onclick="deleteWork(${work.id})" class="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors" title="Delete Work">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Footer Info -->
                <div class="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500">
                    <span>Created: ${createdDate}</span>
                    ${deadline ? `
                        <span class="flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : isDueToday ? 'text-orange-600 font-medium' : ''}">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            ${deadline}${deadlineTime ? ` ${deadlineTime}` : ''}
                        </span>
                    ` : '<span>No deadline</span>'}
                </div>
            </div>
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
