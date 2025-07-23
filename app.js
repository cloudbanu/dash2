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
                mrp: parseFloat(document.getElementById('workMrp').value) || null,
                quotation_rate: parseFloat(document.getElementById('workQuotationRate').value) || null,
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
            
            // Build update object with only the fields that exist in the database
            const updatedWork = {
                work_name: document.getElementById('editWorkName').value,
                category: document.getElementById('editWorkCategory').value,
                whatsapp_number: document.getElementById('editWhatsappNumber').value,
                description: document.getElementById('editWorkDescription').value,
                assigned_staff: document.getElementById('editAssignStaff').value,
                status: document.getElementById('editWorkStatus').value,
                deadline: document.getElementById('editWorkDeadline').value || null,
                deadline_time: document.getElementById('editWorkDeadlineTime').value || null,
                priority: document.getElementById('editWorkPriority').value
            };

            // Only add MRP and quotation_rate if they have values and the columns exist
            const mrpValue = parseFloat(document.getElementById('editWorkMrp').value);
            const quotationValue = parseFloat(document.getElementById('editWorkQuotationRate').value);
            
            if (!isNaN(mrpValue)) {
                updatedWork.mrp = mrpValue;
            }
            if (!isNaN(quotationValue)) {
                updatedWork.quotation_rate = quotationValue;
            }
            
            try {
                const { error } = await supabase
                    .from('works')
                    .update(updatedWork)
                    .eq('id', editingWorkId);
                
                if (error) {
                    // If MRP/quotation_rate columns don't exist, try updating without them
                    if (error.message && error.message.includes('mrp') || error.message.includes('quotation_rate')) {
                        const { mrp, quotation_rate, ...workWithoutPricing } = updatedWork;
                        
                        const { error: retryError } = await supabase
                            .from('works')
                            .update(workWithoutPricing)
                            .eq('id', editingWorkId);
                        
                        if (retryError) throw retryError;
                        
                        showToast('⚠️ Work updated (pricing fields not available in database)', 'warning');
                    } else {
                        throw error;
                    }
                } else {
                    showToast('✅ Work updated successfully!', 'success');
                }
                
                closeEditModal();
                resetUnsavedChanges();
                await refreshWorks();
                
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
        if (currentUserRole !== 'Administrator') {
            setDefaultMemberFilter(name);
        }
        
        renderWorks();
        updateStats();
        updateMemberTiles();
        showTab('dashboard');
        
        showToast(`👋 Welcome back, ${name}!`, 'success');
    });
}

function executeLogout() {
    // Clear saved login state
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserRole');
    
    // Reset global state
    currentUser = null;
    currentUserRole = null;
    works = [];
    categories = [];
    
    // Reset UI
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    
    // Reset forms
    resetForm();
    resetUnsavedChanges();
    
    showToast('👋 Logged out successfully', 'info');
}

// == SETUP MEMBER FILTERS ==
function setupMemberFilters() {
    if (currentUserRole !== 'Administrator') {
        // Hide other member tiles for non-admin users
        const memberTiles = document.querySelectorAll('.member-tile');
        memberTiles.forEach(tile => {
            const tileText = tile.textContent;
            if (!tileText.includes('All') && !tileText.includes(currentUser)) {
                tile.style.display = 'none';
            }
        });
    }
}

// == REAL-TIME SUBSCRIPTIONS ==
function subscribeToWorks() {
    supabase
        .channel('works-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'works' },
            (payload) => {
                console.log('🔄 Works table changed:', payload);
                refreshWorks();
            }
        )
        .subscribe();
}

function subscribeToNotifications() {
    supabase
        .channel('work-notifications')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'works' },
            (payload) => {
                const newWork = payload.new;
                if (newWork.assigned_staff === currentUser && newWork.created_by !== currentUser) {
                    showBrowserNotification('📝 New Work Assigned', {
                        body: `You have been assigned: "${newWork.work_name}"`,
                        tag: 'new-assignment'
                    });
                }
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'works' },
            (payload) => {
                const updatedWork = payload.new;
                const oldWork = payload.old;
                
                if (updatedWork.assigned_staff === currentUser && 
                    updatedWork.status !== oldWork.status) {
                    showBrowserNotification('🔄 Work Status Updated', {
                        body: `"${updatedWork.work_name}" status changed to ${updatedWork.status}`,
                        tag: 'status-update'
                    });
                }
            }
        )
        .subscribe();
}

// == WORKS MANAGEMENT ==
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
        updateRecentActivity();
    } catch (error) {
        console.error('Error fetching works:', error);
        showToast('❌ Failed to refresh works', 'error');
    }
}

function filterWorks() {
    let filteredWorks = [...works];
    
    // Filter by member
    if (currentFilters.member !== 'all') {
        filteredWorks = filteredWorks.filter(work => 
            work.assigned_staff === currentFilters.member
        );
    }
    
    // Filter by status
    if (currentFilters.status !== 'all') {
        filteredWorks = filteredWorks.filter(work => 
            work.status === currentFilters.status
        );
    }
    
    // Filter by category
    if (currentFilters.category !== 'all') {
        filteredWorks = filteredWorks.filter(work => 
            work.category === currentFilters.category
        );
    }
    
    // Filter by creator
    if (currentFilters.creator !== 'all') {
        filteredWorks = filteredWorks.filter(work => 
            work.created_by === currentFilters.creator
        );
    }
    
    // Filter by deadline
    if (currentFilters.deadline !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        filteredWorks = filteredWorks.filter(work => {
            if (!work.deadline) return currentFilters.deadline === 'all';
            
            const workDeadline = new Date(work.deadline);
            workDeadline.setHours(0, 0, 0, 0);
            
            switch (currentFilters.deadline) {
                case 'today':
                    return workDeadline.getTime() === today.getTime();
                case 'tomorrow':
                    return workDeadline.getTime() === tomorrow.getTime();
                case 'week':
                    return workDeadline >= today && workDeadline <= weekEnd;
                case 'overdue':
                    return workDeadline < today && work.status !== 'Completed';
            }
            return true;
        });
    }
    
    // Sort works
    filteredWorks.sort((a, b) => {
        switch (currentFilters.sort) {
            case 'overdue_pending':
                // First, sort by overdue status
                const aOverdue = isOverdue(a);
                const bOverdue = isOverdue(b);
                if (aOverdue && !bOverdue) return -1;
                if (!aOverdue && bOverdue) return 1;
                
                // Then by pending status
                const aPending = a.status === 'Pending';
                const bPending = b.status === 'Pending';
                if (aPending && !bPending) return -1;
                if (!aPending && bPending) return 1;
                
                // Finally by creation date (newest first)
                return new Date(b.created_at) - new Date(a.created_at);
                
            case 'newest':
                return new Date(b.created_at) - new Date(a.created_at);
                
            case 'oldest':
                return new Date(a.created_at) - new Date(b.created_at);
                
            case 'deadline':
                if (!a.deadline && !b.deadline) return 0;
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
                
            case 'status':
                const statusOrder = { 'Pending': 0, 'In Progress': 1, 'Completed': 2 };
                return statusOrder[a.status] - statusOrder[b.status];
                
            default:
                return new Date(b.created_at) - new Date(a.created_at);
        }
    });
    
    return filteredWorks;
}

function renderWorks() {
    const filteredWorks = filterWorks();
    const container = document.getElementById('worksCardsContainer');
    const noWorks = document.getElementById('noWorks');
    
    if (!container) return;
    
    if (filteredWorks.length === 0) {
        container.innerHTML = '';
        if (noWorks) noWorks.classList.remove('hidden');
        return;
    }
    
    if (noWorks) noWorks.classList.add('hidden');
    
    container.innerHTML = filteredWorks.map(work => createWorkCard(work)).join('');
}

function createWorkCard(work) {
    const isOverdueWork = isOverdue(work);
    const deadlineText = formatDeadline(work);
    const avatar = memberAvatars[work.assigned_staff] || 'default-avatar.jpg';
    
    const priorityColors = {
        'High': 'bg-red-100 text-red-800',
        'Medium': 'bg-yellow-100 text-yellow-800',
        'Low': 'bg-green-100 text-green-800'
    };
    
    const statusColors = {
        'Pending': 'bg-orange-100 text-orange-800',
        'In Progress': 'bg-blue-100 text-blue-800',
        'Completed': 'bg-green-100 text-green-800'
    };
    
    return `
        <div class="work-card p-6 animate-fade-in" onclick="showWorkDetails(${work.id})">
            ${isOverdueWork ? '<div class="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>' : ''}
            
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h3 class="font-semibold text-gray-800 text-lg mb-1 line-clamp-2">${work.work_name}</h3>
                    <p class="text-sm text-gray-600 mb-2">${work.category || 'No Category'}</p>
                </div>
                <div class="status-dropdown">
                    <button class="status-button ${statusColors[work.status] || 'bg-gray-100 text-gray-800'}" 
                            onclick="event.stopPropagation(); changeWorkStatus(${work.id}, '${work.status}', this)">
                        ${work.status}
                    </button>
                </div>
            </div>
            
            ${work.description ? `<p class="text-gray-600 text-sm mb-4 line-clamp-3">${work.description}</p>` : ''}
            
            <!-- Pricing Information -->
            ${work.mrp || work.quotation_rate ? `
                <div class="flex gap-4 mb-4 text-sm">
                    ${work.mrp ? `<div class="text-gray-600">MRP: <span class="font-medium text-gray-800">₹${work.mrp}</span></div>` : ''}
                    ${work.quotation_rate ? `<div class="text-gray-600">Quote: <span class="font-medium text-gray-800">₹${work.quotation_rate}</span></div>` : ''}
                </div>
            ` : ''}
            
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                    <img src="${avatar}" alt="${work.assigned_staff}" class="w-8 h-8 rounded-full object-cover">
                    <span class="text-sm font-medium text-gray-700">${work.assigned_staff}</span>
                </div>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${priorityColors[work.priority] || 'bg-gray-100 text-gray-800'}">
                    ${work.priority}
                </span>
            </div>
            
            <div class="flex items-center justify-between text-sm text-gray-500">
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        ${deadlineText}
                    </div>
                    ${work.whatsapp_number ? `
                        <button onclick="event.stopPropagation(); copyToClipboard('${work.whatsapp_number}')" 
                                class="flex items-center gap-1 text-green-600 hover:text-green-700 transition-colors">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.394"></path>
                            </svg>
                            ${work.whatsapp_number}
                        </button>
                    ` : ''}
                </div>
                <div class="text-xs text-gray-400">
                    ${formatRelativeTime(work.created_at)}
                </div>
            </div>
            
            <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                <span class="text-xs text-gray-500">By ${work.created_by}</span>
                <div class="flex gap-2">
                    <button onclick="event.stopPropagation(); editWork(${work.id})" 
                            class="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                    <button onclick="event.stopPropagation(); showDeleteConfirmation(${work.id}, '${work.work_name}')" 
                            class="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// == WORK ACTIONS ==
async function changeWorkStatus(workId, currentStatus, buttonElement) {
    const statusOptions = ['Pending', 'In Progress', 'Completed'];
    const currentIndex = statusOptions.indexOf(currentStatus);
    const nextStatus = statusOptions[(currentIndex + 1) % statusOptions.length];
    
    try {
        const { error } = await supabase
            .from('works')
            .update({ status: nextStatus })
            .eq('id', workId);
        
        if (error) throw error;
        
        await refreshWorks();
        showToast(`✅ Status updated to ${nextStatus}`, 'success');
        
        // Show browser notification
        const work = works.find(w => w.id === workId);
        if (work) {
            showBrowserNotification('🔄 Status Updated', {
                body: `"${work.work_name}" is now ${nextStatus}`,
                tag: 'status-change'
            });
        }
    } catch (error) {
        console.error('Error updating work status:', error);
        showToast('❌ Failed to update status', 'error');
    }
}

function showWorkDetails(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    currentWorkId = workId;
    const avatar = memberAvatars[work.assigned_staff] || 'default-avatar.jpg';
    const creatorAvatar = memberAvatars[work.created_by] || 'default-avatar.jpg';
    
    const priorityColors = {
        'High': 'bg-red-100 text-red-800',
        'Medium': 'bg-yellow-100 text-yellow-800',
        'Low': 'bg-green-100 text-green-800'
    };
    
    const statusColors = {
        'Pending': 'bg-orange-100 text-orange-800',
        'In Progress': 'bg-blue-100 text-blue-800',
        'Completed': 'bg-green-100 text-green-800'
    };
    
    const isOverdueWork = isOverdue(work);
    const deadlineText = formatDeadline(work);
    
    const content = `
        <div class="space-y-6">
            <!-- Header -->
            <div class="border-b border-gray-200 pb-4">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-xl font-bold text-gray-800">${work.work_name}</h3>
                    ${isOverdueWork ? '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Overdue</span>' : ''}
                </div>
                <div class="flex items-center gap-2 mb-2">
                    <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColors[work.status]}">${work.status}</span>
                    <span class="px-3 py-1 rounded-full text-sm font-medium ${priorityColors[work.priority]}">${work.priority} Priority</span>
                </div>
                <p class="text-gray-600">${work.category || 'No Category'}</p>
            </div>
            
            <!-- Description -->
            ${work.description ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Description</h4>
                    <p class="text-gray-600 bg-gray-50 p-3 rounded-lg">${work.description}</p>
                </div>
            ` : ''}
            
            <!-- Pricing Information -->
            ${work.mrp || work.quotation_rate ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Pricing</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${work.mrp ? `
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-sm text-gray-600">MRP</div>
                                <div class="text-lg font-semibold text-gray-800">₹${work.mrp}</div>
                            </div>
                        ` : ''}
                        ${work.quotation_rate ? `
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-sm text-gray-600">Quotation Rate</div>
                                <div class="text-lg font-semibold text-gray-800">₹${work.quotation_rate}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- Assignment & Timeline -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Assigned To</h4>
                    <div class="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                        <img src="${avatar}" alt="${work.assigned_staff}" class="w-10 h-10 rounded-full object-cover">
                        <div>
                            <div class="font-medium text-gray-800">${work.assigned_staff}</div>
                            <div class="text-sm text-gray-600">Staff Member</div>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Created By</h4>
                    <div class="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                        <img src="${creatorAvatar}" alt="${work.created_by}" class="w-10 h-10 rounded-full object-cover">
                        <div>
                            <div class="font-medium text-gray-800">${work.created_by}</div>
                            <div class="text-sm text-gray-600">${formatRelativeTime(work.created_at)}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Deadline -->
            ${work.deadline ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Deadline</h4>
                    <div class="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span class="text-gray-800 font-medium">${deadlineText}</span>
                        ${isOverdueWork ? '<span class="text-red-600 text-sm">(Overdue)</span>' : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- Contact -->
            ${work.whatsapp_number ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Contact</h4>
                    <button onclick="copyToClipboard('${work.whatsapp_number}')" 
                            class="flex items-center gap-3 bg-green-50 hover:bg-green-100 p-3 rounded-lg transition-colors w-full text-left">
                        <svg class="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.394"></path>
                        </svg>
                        <div>
                            <div class="font-medium text-gray-800">${work.whatsapp_number}</div>
                            <div class="text-sm text-gray-600">Click to copy</div>
                        </div>
                    </button>
                </div>
            ` : ''}
            
            <!-- Actions -->
            <div class="flex gap-3 pt-4 border-t border-gray-200">
                <button onclick="editWork(${work.id}); closeWorkDetailsModal();" 
                        class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                    Edit Work
                </button>
                <button onclick="showDeleteConfirmation(${work.id}, '${work.work_name}'); closeWorkDetailsModal();" 
                        class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('workDetailsContent').innerHTML = content;
    document.getElementById('workDetailsModal').classList.remove('hidden');
}

function editWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    editingWorkId = workId;
    resetUnsavedChanges();
    
    // Populate form fields
    document.getElementById('editWorkName').value = work.work_name || '';
    document.getElementById('editWorkCategory').value = work.category || '';
    document.getElementById('editWhatsappNumber').value = work.whatsapp_number || '';
    document.getElementById('editWorkDescription').value = work.description || '';
    document.getElementById('editWorkMrp').value = work.mrp || '';
    document.getElementById('editWorkQuotationRate').value = work.quotation_rate || '';
    document.getElementById('editAssignStaff').value = work.assigned_staff || '';
    document.getElementById('editWorkStatus').value = work.status || 'Pending';
    document.getElementById('editWorkDeadline').value = work.deadline || '';
    document.getElementById('editWorkDeadlineTime').value = work.deadline_time || '';
    document.getElementById('editWorkPriority').value = work.priority || 'Medium';
    
    document.getElementById('editWorkModal').classList.remove('hidden');
    
    // Set up change tracking after a short delay
    setTimeout(trackChanges, 100);
}

async function executeDeleteWork(workId) {
    try {
        const { error } = await supabase
            .from('works')
            .delete()
            .eq('id', workId);
        
        if (error) throw error;
        
        await refreshWorks();
        showToast('✅ Work deleted successfully!', 'success');
        
        // Show browser notification
        showBrowserNotification('❌ Work Deleted', {
            body: 'A work item has been deleted',
            tag: 'work-delete'
        });
        
    } catch (error) {
        console.error('Error deleting work:', error);
        showToast('❌ Failed to delete work', 'error');
    }
}

// == UTILITY FUNCTIONS ==
function isOverdue(work) {
    if (!work.deadline || work.status === 'Completed') return false;
    
    const today = new Date();
    const deadline = new Date(work.deadline);
    
    // If there's a deadline time, include it in comparison
    if (work.deadline_time) {
        const [hours, minutes] = work.deadline_time.split(':');
        deadline.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        return deadline < today;
    } else {
        // If no time specified, consider it overdue at end of deadline date
        deadline.setHours(23, 59, 59, 999);
        return deadline < today;
    }
}

function formatDeadline(work) {
    if (!work.deadline) return 'No deadline';
    
    const deadline = new Date(work.deadline);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Reset times for date comparison
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    const todayDate = new Date(today);
    todayDate.setHours(0, 0, 0, 0);
    const tomorrowDate = new Date(tomorrow);
    tomorrowDate.setHours(0, 0, 0, 0);
    
    let dateText;
    if (deadlineDate.getTime() === todayDate.getTime()) {
        dateText = 'Today';
    } else if (deadlineDate.getTime() === tomorrowDate.getTime()) {
        dateText = 'Tomorrow';
    } else {
        dateText = deadline.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: deadline.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }
    
    // Add time if specified
    if (work.deadline_time) {
        const time = new Date(`2000-01-01T${work.deadline_time}`).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `${dateText} at ${time}`;
    }
    
    return dateText;
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function updateDateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    const dateString = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short', 
        day: 'numeric'
    });
    
    const element = document.getElementById('currentDateTime');
    if (element) {
        element.textContent = `${dateString} • ${timeString}`;
    }
}

// == STATS UPDATE ==
function updateStats() {
    const totalWorksElement = document.getElementById('totalWorks');
    const pendingWorksElement = document.getElementById('pendingWorks');
    const completedWorksElement = document.getElementById('completedWorks');
    const dueTodayWorksElement = document.getElementById('dueTodayWorks');
    
    if (totalWorksElement) totalWorksElement.textContent = works.length;
    if (pendingWorksElement) pendingWorksElement.textContent = works.filter(w => w.status === 'Pending').length;
    if (completedWorksElement) completedWorksElement.textContent = works.filter(w => w.status === 'Completed').length;
    
    if (dueTodayWorksElement) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueTodayCount = works.filter(work => {
            if (!work.deadline || work.status === 'Completed') return false;
            const workDeadline = new Date(work.deadline);
            workDeadline.setHours(0, 0, 0, 0);
            return workDeadline.getTime() === today.getTime();
        }).length;
        dueTodayWorksElement.textContent = dueTodayCount;
    }
}

// == RECENT ACTIVITY ==
function updateRecentActivity() {
    const recentActivityElement = document.getElementById('recentActivity');
    if (!recentActivityElement) return;
    
    const recentWorks = works
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
    
    if (recentWorks.length === 0) {
        recentActivityElement.innerHTML = '<p class="text-gray-500 text-center py-8">No recent activity</p>';
        return;
    }
    
    recentActivityElement.innerHTML = recentWorks.map(work => {
        const avatar = memberAvatars[work.assigned_staff] || 'default-avatar.jpg';
        const statusColors = {
            'Pending': 'bg-orange-100 text-orange-800',
            'In Progress': 'bg-blue-100 text-blue-800', 
            'Completed': 'bg-green-100 text-green-800'
        };
        
        return `
            <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onclick="showWorkDetails(${work.id})">
                <img src="${avatar}" alt="${work.assigned_staff}" class="w-8 h-8 rounded-full object-cover">
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-800 truncate">${work.work_name}</div>
                    <div class="text-sm text-gray-600">Assigned to ${work.assigned_staff}</div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColors[work.status]}">${work.status}</span>
                    <span class="text-xs text-gray-500">${formatRelativeTime(work.created_at)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// == FORM RESET ==
function resetForm() {
    const form = document.getElementById('workForm');
    if (form) {
        form.reset();
    }
    
    // Reset custom dropdowns
    document.getElementById('categoryText').textContent = 'Select Category';
    document.getElementById('assignStaffText').textContent = 'Select Staff Member';
    document.getElementById('priorityText').textContent = 'Medium';
    
    // Reset hidden inputs
    document.getElementById('workCategory').value = '';
    document.getElementById('assignStaff').value = '';
    document.getElementById('workPriority').value = 'Medium';
    
    // Clear search
    const categorySearch = document.getElementById('categorySearch');
    if (categorySearch) {
        categorySearch.value = '';
        filterCategories('');
    }
}

// == TAB MANAGEMENT ==
function showTab(tabName) {
    // Update navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('bg-primary', 'text-white');
        tab.classList.add('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
    });
    
    const activeTab = document.getElementById(tabName + 'Tab');
    if (activeTab) {
        activeTab.classList.add('bg-primary', 'text-white');
        activeTab.classList.remove('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
    }
    
    // Show selected tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    const activeContent = document.getElementById(tabName + 'Content');
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }
    
    // Update data when switching to works tab
    if (tabName === 'works') {
        renderWorks();
        updateMemberTiles();
    } else if (tabName === 'dashboard') {
        updateStats();
        updateRecentActivity();
    }
}

// == EXPOSE FUNCTIONS TO GLOBAL SCOPE ==
window.loginUser = loginUser;
window.showTab = showTab;
window.showWorkDetails = showWorkDetails;
window.editWork = editWork;
window.executeDeleteWork = executeDeleteWork;
window.changeWorkStatus = changeWorkStatus;
window.copyToClipboard = copyToClipboard;
window.toggleNotifications = toggleNotifications;
window.showLogoutConfirmation = showLogoutConfirmation;
window.closeLogoutConfirmModal = closeLogoutConfirmModal; 
window.confirmLogout = confirmLogout;
window.showDeleteConfirmation = showDeleteConfirmation;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.confirmDelete = confirmDelete;
window.closeWorkDetailsModal = closeWorkDetailsModal;
window.closeEditModal = closeEditModal;
window.closeAddCategoryModal = closeAddCategoryModal;
window.showUnsavedChangesModal = showUnsavedChangesModal;
window.closeUnsavedChangesModal = closeUnsavedChangesModal;
window.discardChanges = discardChanges;
window.showAddCategoryModal = showAddCategoryModal;
window.selectCategory = selectCategory;
window.filterCategories = filterCategories;
window.selectAssignStaff = selectAssignStaff;
window.selectPriority = selectPriority;
window.cancelAddWork = cancelAddWork;
window.clearAllFilters = clearAllFilters;
window.selectMemberTile = selectMemberTile;
window.goToWorksWithFilter = goToWorksWithFilter;
window.selectStatusFilter = selectStatusFilter;
window.selectCategoryFilter = selectCategoryFilter;
window.selectDeadlineFilter = selectDeadlineFilter;
window.selectCreatorFilter = selectCreatorFilter;
window.selectSortFilter = selectSortFilter;
window.toggleStatusDropdown = toggleStatusDropdown;
window.toggleCategoryDropdown = toggleCategoryDropdown;
window.toggleDeadlineDropdown = toggleDeadlineDropdown;
window.toggleCreatorDropdown = toggleCreatorDropdown;
window.toggleSortDropdown = toggleSortDropdown;
window.toggleAssignStaffDropdown = toggleAssignStaffDropdown;
window.togglePriorityDropdown = togglePriorityDropdown;
window.toggleCategorySearchDropdown = toggleCategorySearchDropdown;
