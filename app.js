// == CONFIGURATION ==
const SUPABASE_URL = 'https://icmlxulaxsacuvlkghlz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbWx4dWxheHNhY3V2bGtnaGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTk0MTgsImV4cCI6MjA2ODY5NTQxOH0.zVGLqIpCIlMoSQAInaCybz9bY1zq82IL9DC5uMs1tFQ';

// Member avatars mapping
const memberAvatars = {
    'Irshad': 'irshad.jpg',
    'Niyas': 'niyas.jpg',
    'Muhammed': 'muhammed.jpg',
    'Noora': 'noora.jpg',
    'Najil': 'najil.jpg',
    'Safvan': 'safvan.jpg'
};

// == Initialize Supabase ==
// == Initialize Supabase ==
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// == Global State ==
let currentUser = null;
let currentUserRole = null;
let sessionId = null;
let works = [];
let categories = [];
let quickTasks = [];
let currentWorkId = null;
let editingWorkId = null;
let deleteWorkId = null;
let showCompletedWorks = false;
let showUnpaidWorks = false; // UPDATED: New state for unpaid works
let statusUpdateInProgress = new Set();
let currentFilters = {
    member: 'all',
    status: 'all',
    deadline: 'all',
    creator: 'all',
    category: 'all'
};
let notificationsEnabled = false;
let currentSearchTerm = '';

// Image upload variables
let uploadedImages = [];
let editUploadedImages = [];
let currentWorkImages = [];

// == UPDATED: NOTIFICATION SYSTEM ==
function showNotification(message, type = 'info', duration = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;

    // Determine icon based on type
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<svg class="notification-icon success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            break;
        case 'error':
            icon = '<svg class="notification-icon error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            break;
        case 'warning':
            icon = '<svg class="notification-icon warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>';
            break;
        default: // info
            icon = '<svg class="notification-icon info" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    notification.innerHTML = `
        ${icon}
        <div class="notification-message">${message}</div>
    `;

    // Add click to dismiss
    notification.onclick = () => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    };

    // Add to container
    container.appendChild(notification);

    // Auto remove after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}

// == INITIALIZATION ==
document.addEventListener('DOMContentLoaded', async function () {
    updateDateTime();
    setInterval(updateDateTime, 1000);

    sessionId = generateSessionId();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed'));
    }

    await requestNotificationPermission();
    setupKeyboardEventListeners();
    setupImageUpload();

    const savedUser = localStorage.getItem('currentUser');
    const savedRole = localStorage.getItem('currentUserRole');

    if (savedUser && savedRole) {
        currentUser = savedUser;
        currentUserRole = savedRole;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userName').textContent = savedUser;
        document.getElementById('profileUserName').textContent = savedUser;
        document.getElementById('userAvatar').src = memberAvatars[savedUser];

        await Promise.all([
            refreshWorks(),
            refreshCategories(),
            refreshQuickTasks()
        ]);

        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        subscribeToQuickTasks();

        renderWorks();
        updateStats();
        updateMemberTiles();
        showTab('dashboard');
    }

    setupDropdownHandlers();
    setupFormHandlers();
});

// == SESSION MANAGEMENT ==
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// == QUICK TASKS FUNCTIONALITY ==
async function refreshQuickTasks() {
    try {
        const { data, error } = await sb
            .from('quick_tasks')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        quickTasks = data || [];

        renderQuickTasks();
    } catch (error) {
        console.error('Error fetching quick tasks:', error);
        showNotification('❌ Failed to refresh quick tasks', 'error');
    }
}

function renderQuickTasks() {
    const container = document.getElementById('quickTasksContainer');
    if (!container) return;

    const addButton = container.querySelector('.add-task-btn');
    container.innerHTML = '';
    if (addButton) {
        container.appendChild(addButton);
    }

    if (quickTasks.length === 0) {
        document.getElementById('noQuickTasks')?.classList.remove('hidden');
        return;
    }

    document.getElementById('noQuickTasks')?.classList.add('hidden');

    const today = new Date().toDateString();
    const tomorrow = new Date(Date.now() + 86400000).toDateString();

    quickTasks.forEach(task => {
        const taskCard = createQuickTaskCard(task, today, tomorrow);
        container.appendChild(taskCard);
    });
}

function createQuickTaskCard(task, today, tomorrow) {
    const div = document.createElement('div');
    const avatar = memberAvatars[task.assigned_staff] || 'default-avatar.jpg';

    let cardClass = 'quick-task-card';
    let dueDateText = '';

    if (task.completed) {
        cardClass += ' completed';
    }

    if (task.due_date) {
        const taskDate = new Date(task.due_date).toDateString();
        if (taskDate === today) {
            cardClass += ' today';
            dueDateText = '📅 Today';
        } else if (taskDate === tomorrow) {
            cardClass += ' tomorrow';
            dueDateText = '🗓️ Tomorrow';
        } else {
            dueDateText = `📆 ${new Date(task.due_date).toLocaleDateString()}`;
        }
    }

    div.className = cardClass;
    div.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleQuickTask(${task.id})">
                ${task.completed ? '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
            </div>
            <button onclick="deleteQuickTask(${task.id})" class="text-gray-400 hover:text-red-500 p-1 rounded transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
        
        <h3 class="task-title font-semibold text-gray-800 mb-3">${task.task_name}</h3>
        
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <img src="${avatar}" alt="${task.assigned_staff}" class="w-6 h-6 rounded-full object-cover">
                <span class="text-sm text-gray-600">${task.assigned_staff}</span>
            </div>
            ${dueDateText ? `<span class="text-xs text-gray-500">${dueDateText}</span>` : ''}
        </div>
        
        <div class="mt-2 text-xs text-gray-400">
            Created ${formatRelativeTime(task.created_at)}
        </div>
    `;

    return div;
}

async function toggleQuickTask(taskId) {
    try {
        const task = quickTasks.find(t => t.id === taskId);
        if (!task) return;

        const { error } = await sb
            .from('quick_tasks')
            .update({ completed: !task.completed })
            .eq('id', taskId);

        if (error) throw error;

        task.completed = !task.completed;
        renderQuickTasks();

        showNotification(task.completed ? '✅ Task completed!' : '🔄 Task marked as pending', 'success');
    } catch (error) {
        console.error('Error updating task:', error);
        showNotification('❌ Failed to update task', 'error');
    }
}

async function deleteQuickTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        const { error } = await sb
            .from('quick_tasks')
            .delete()
            .eq('id', taskId);

        if (error) throw error;

        quickTasks = quickTasks.filter(t => t.id !== taskId);
        renderQuickTasks();

        showNotification('🗑️ Task deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting task:', error);
        showNotification('❌ Failed to delete task', 'error');
    }
}

// == QUICK TASK MODAL FUNCTIONS ==
function showAddQuickTaskModal() {
    resetQuickTaskForm();
    document.getElementById('addQuickTaskModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('quickTaskName').focus();
    }, 100);
}

function closeAddQuickTaskModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('addQuickTaskModal').classList.add('hidden');
    resetQuickTaskForm();
}

function resetQuickTaskForm() {
    document.getElementById('addQuickTaskForm').reset();
    document.getElementById('quickTaskStaffText').textContent = 'Select Staff Member';
    document.getElementById('quickTaskStaff').value = '';
    document.getElementById('quickTaskDate').value = '';
    clearQuickTaskDateButtons();
}

function selectQuickTaskStaff(staffName) {
    document.getElementById('quickTaskStaff').value = staffName;
    document.getElementById('quickTaskStaffText').textContent = staffName;
    closeAllDropdowns();
}

function setQuickTaskDate(type) {
    clearQuickTaskDateButtons();

    const today = new Date();
    let targetDate;

    if (type === 'today') {
        targetDate = today;
        document.getElementById('todayBtn').classList.add('bg-yellow-100', 'border-yellow-300', 'text-yellow-800');
    } else if (type === 'tomorrow') {
        targetDate = new Date(today.getTime() + 86400000);
        document.getElementById('tomorrowBtn').classList.add('bg-blue-100', 'border-blue-300', 'text-blue-800');
    }

    document.getElementById('quickTaskDate').value = targetDate.toISOString().split('T')[0];
}

function clearQuickTaskDate() {
    document.getElementById('quickTaskDate').value = '';
    clearQuickTaskDateButtons();
}

function clearQuickTaskDateButtons() {
    ['todayBtn', 'tomorrowBtn'].forEach(id => {
        const btn = document.getElementById(id);
        btn.classList.remove('bg-yellow-100', 'border-yellow-300', 'text-yellow-800', 'bg-blue-100', 'border-blue-300', 'text-blue-800');
    });
}

function toggleQuickTaskStaffDropdown() {
    toggleDropdown('quickTaskStaffDropdown', 'quickTaskStaffIcon');
}

// == UPDATED: REAL-TIME SEARCH FUNCTIONALITY ==
function handleRealtimeSearch(searchTerm) {
    currentSearchTerm = searchTerm.toLowerCase().trim();
    renderWorks();
}

// == PROFILE DROPDOWN ==
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdownMenu');
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        setTimeout(() => {
            document.addEventListener('click', closeProfileDropdown);
        }, 100);
    } else {
        dropdown.classList.add('hidden');
    }
}

function closeProfileDropdown(event) {
    const dropdown = document.getElementById('profileDropdownMenu');
    const profileArea = event.target.closest('.profile-dropdown');

    if (!profileArea) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeProfileDropdown);
    }
}

// == IMAGE UPLOAD FUNCTIONALITY ==
function setupImageUpload() {
    const uploadArea = document.getElementById('imageUploadArea');

    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    processImages(files, false);
}

function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    processImages(files, false);
}

function handleEditImageUpload(event) {
    const files = Array.from(event.target.files);
    processImages(files, true);
}

async function processImages(files, isEdit = false) {
    if (files.length === 0) return;

    const progressContainer = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');

    if (progressContainer && progressBar) {
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
    }

    const totalFiles = files.length;
    let processedFiles = 0;

    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            showNotification('❌ File too large. Maximum size is 10MB', 'error');
            continue;
        }

        try {
            const compressedFile = await compressImage(file, 0.6);
            const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${file.name.split('.').pop()}`;

            const { data, error } = await sb.storage
                .from('work-images')
                .upload(fileName, compressedFile);

            if (error) throw error;

            const { data: { publicUrl } } = sb.storage
                .from('work-images')
                .getPublicUrl(fileName);

            const imageData = {
                url: publicUrl,
                name: file.name,
                fileName: fileName
            };

            if (isEdit) {
                editUploadedImages.push(imageData);
                updateEditImagePreview();
            } else {
                uploadedImages.push(imageData);
                updateImagePreview();
            }

        } catch (error) {
            console.error('Error uploading image:', error);
            showNotification('❌ Failed to upload image: ' + file.name, 'error');
        }

        processedFiles++;
        if (progressBar) {
            progressBar.style.width = `${(processedFiles / totalFiles) * 100}%`;
        }
    }

    if (progressContainer) {
        setTimeout(() => {
            progressContainer.classList.add('hidden');
        }, 1000);
    }

    showNotification(`✅ ${processedFiles} image(s) uploaded successfully`, 'success');
}

function compressImage(file, quality) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            const maxWidth = 1920;
            const maxHeight = 1080;
            let { width, height } = img;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }

            canvas.width = width;
            canvas.height = height;

            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolve, 'image/jpeg', quality);
        };

        img.src = URL.createObjectURL(file);
    });
}

function updateImagePreview() {
    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;

    if (uploadedImages.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = uploadedImages.map((image, index) => `
        <div class="image-item">
            <img src="${image.url}" alt="${image.name}" onclick="viewImage('${image.url}')">
            <button class="image-remove-btn" onclick="removeImage(${index}, false)">×</button>
        </div>
    `).join('');
}

function updateEditImagePreview() {
    const container = document.getElementById('editImagePreviewContainer');
    if (!container) return;

    const allImages = [...(currentWorkImages || []), ...editUploadedImages];

    if (allImages.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = allImages.map((image, index) => {
        const isExisting = index < (currentWorkImages?.length || 0);
        return `
            <div class="image-item">
                <img src="${image.url || image}" alt="${image.name || 'Work image'}" onclick="viewImage('${image.url || image}')">
                <button class="image-remove-btn" onclick="removeImage(${index}, true, ${isExisting})">×</button>
            </div>
        `;
    }).join('');
}

function removeImage(index, isEdit = false, isExisting = false) {
    if (isEdit) {
        if (isExisting) {
            if (currentWorkImages) {
                currentWorkImages.splice(index, 1);
            }
        } else {
            const newIndex = index - (currentWorkImages?.length || 0);
            editUploadedImages.splice(newIndex, 1);
        }
        updateEditImagePreview();
    } else {
        uploadedImages.splice(index, 1);
        updateImagePreview();
    }
}

function viewImage(url) {
    const modal = document.getElementById('imageViewerModal');
    const img = document.getElementById('imageViewerImg');
    if (modal && img) {
        img.src = url;
        modal.classList.remove('hidden');
    }
}

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// == KEYBOARD EVENT LISTENERS ==
function setupKeyboardEventListeners() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (!document.getElementById('workDetailsModal').classList.contains('hidden')) {
                closeWorkDetailsModal();
            } else if (!document.getElementById('editWorkModal').classList.contains('hidden')) {
                closeEditModal();
            } else if (!document.getElementById('addCategoryModal').classList.contains('hidden')) {
                closeAddCategoryModal();
            } else if (!document.getElementById('deleteConfirmModal').classList.contains('hidden')) {
                closeDeleteConfirmModal();
            } else if (!document.getElementById('addQuickTaskModal').classList.contains('hidden')) {
                closeAddQuickTaskModal();
            } else if (!document.getElementById('logoutConfirmModal').classList.contains('hidden')) {
                closeLogoutConfirmModal();
            } else if (!document.getElementById('imageViewerModal').classList.contains('hidden')) {
                closeImageViewer();
            } else {
                closeAllDropdowns();
                closeProfileDropdown({ target: document.body });
            }
        }
    });
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

    const modal = document.getElementById('editWorkModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    editingWorkId = null;
    editUploadedImages = [];
    currentWorkImages = [];
}

function closeAddCategoryModal(event) {
    if (event && event.target !== event.currentTarget) return;

    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.getElementById('addCategoryForm').reset();
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

// == CATEGORIES MANAGEMENT ==
async function refreshCategories() {
    try {
        const { data, error } = await sb
            .from('categories')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        categories = data || [];

        populateCategoryDropdowns();
    } catch (error) {
        console.error('Error fetching categories:', error);
        showNotification('❌ Failed to refresh categories', 'error');
    }
}

function populateCategoryDropdowns() {
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
    filterCategories('');
}

function selectCategoryFilter(categoryName) {
    currentFilters.category = categoryName;
    document.getElementById('categoryFilterText').textContent = categoryName;
    closeAllDropdowns();
    renderWorks();
}

function showAddCategoryModal() {
    closeAllDropdowns();
    document.getElementById('addCategoryModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('newCategoryName').focus();
    }, 100);
}

// == FORM HANDLERS ==
function setupFormHandlers() {
    const workForm = document.getElementById('workForm');
    if (workForm) {
        workForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const assignedStaff = document.getElementById('assignStaff').value;
            const category = document.getElementById('workCategory').value;

            if (!assignedStaff) {
                showNotification('❌ Please select a staff member', 'error');
                return;
            }

            if (!category) {
                showNotification('❌ Please select a category', 'error');
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
                created_by: currentUser,
                images: uploadedImages.map(img => img.url)
            };

            try {
                const { data, error } = await sb
                    .from('works')
                    .insert([workData])
                    .select();

                if (error) throw error;

                resetForm();
                uploadedImages = [];
                updateImagePreview();
                await refreshWorks();
                showTab('works');
                showNotification('✅ Work added successfully!', 'success');

                if (assignedStaff !== currentUser) {
                    await createNotification(
                        assignedStaff,
                        currentUser,
                        data[0].id,
                        'work_assigned',
                        `${currentUser} assigned you a new work`,
                        `"${workData.work_name}" has been assigned to you`,
                        sessionId
                    );
                }

            } catch (error) {
                console.error('Error adding work:', error);
                showNotification('❌ Failed to add work', 'error');
            }
        });
    }

    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const categoryName = document.getElementById('newCategoryName').value.trim();

            if (!categoryName) {
                showNotification('❌ Please enter a category name', 'error');
                return;
            }

            const existingCategory = categories.find(cat =>
                cat.name.toLowerCase() === categoryName.toLowerCase()
            );

            if (existingCategory) {
                showNotification('❌ Category already exists', 'error');
                return;
            }

            try {
                const { data, error } = await sb
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
                showNotification('✅ Category added successfully!', 'success');

            } catch (error) {
                console.error('Error adding category:', error);
                showNotification('❌ Failed to add category', 'error');
            }
        });
    }

    const addQuickTaskForm = document.getElementById('addQuickTaskForm');
    if (addQuickTaskForm) {
        addQuickTaskForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const taskName = document.getElementById('quickTaskName').value.trim();
            const assignedStaff = document.getElementById('quickTaskStaff').value;
            const dueDate = document.getElementById('quickTaskDate').value;

            if (!taskName) {
                showNotification('❌ Please enter a task name', 'error');
                return;
            }

            if (!assignedStaff) {
                showNotification('❌ Please select a staff member', 'error');
                return;
            }

            const taskData = {
                task_name: taskName,
                assigned_staff: assignedStaff,
                due_date: dueDate || null,
                created_by: currentUser
            };

            try {
                const { data, error } = await sb
                    .from('quick_tasks')
                    .insert([taskData])
                    .select();

                if (error) throw error;

                await refreshQuickTasks();
                closeAddQuickTaskModal();
                showNotification('✅ Quick task added successfully!', 'success');

            } catch (error) {
                console.error('Error adding quick task:', error);
                showNotification('❌ Failed to add quick task', 'error');
            }
        });
    }

    const editWorkForm = document.getElementById('editWorkForm');
    if (editWorkForm) {
        editWorkForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            if (!editingWorkId) return;

            const allImages = [...(currentWorkImages || []), ...editUploadedImages.map(img => img.url)];

            const updatedWork = {
                work_name: document.getElementById('editWorkName').value,
                category: document.getElementById('editWorkCategory').value,
                whatsapp_number: document.getElementById('editWhatsappNumber').value,
                description: document.getElementById('editWorkDescription').value,
                assigned_staff: document.getElementById('editAssignStaff').value,
                status: document.getElementById('editWorkStatus').value,
                deadline: document.getElementById('editWorkDeadline').value || null,
                deadline_time: document.getElementById('editWorkDeadlineTime').value || null,
                priority: document.getElementById('editWorkPriority').value,
                images: allImages
            };

            const mrpValue = parseFloat(document.getElementById('editWorkMrp').value);
            const quotationValue = parseFloat(document.getElementById('editWorkQuotationRate').value);

            if (!isNaN(mrpValue)) {
                updatedWork.mrp = mrpValue;
            }
            if (!isNaN(quotationValue)) {
                updatedWork.quotation_rate = quotationValue;
            }

            try {
                const { error } = await sb
                    .from('works')
                    .update(updatedWork)
                    .eq('id', editingWorkId);

                if (error) throw error;

                const modal = document.getElementById('editWorkModal');
                if (modal) {
                    modal.classList.add('hidden');
                }
                editingWorkId = null;
                editUploadedImages = [];
                currentWorkImages = [];

                await refreshWorks();
                showNotification('✅ Work updated successfully!', 'success');

            } catch (error) {
                console.error('Error updating work:', error);
                showNotification('❌ Failed to update work', 'error');
            }
        });
    }
}

// == NOTIFICATION SYSTEM ==
async function createNotification(recipientUser, senderUser, workId, type, title, message, senderSessionId) {
    try {
        const { error } = await sb
            .from('notifications')
            .insert([{
                recipient_user: recipientUser,
                sender_user: senderUser,
                work_id: workId,
                notification_type: type,
                title: title,
                message: message,
                session_id: senderSessionId
            }]);

        if (error) throw error;

        console.log('✅ Notification created successfully');
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

// == DROPDOWN MANAGEMENT ==
function setupDropdownHandlers() {
    document.addEventListener('click', function (event) {
        if (!event.target.closest('.custom-dropdown') &&
            !event.target.closest('.status-dropdown') &&
            !event.target.closest('.profile-dropdown')) {
            closeAllDropdowns();
            closeProfileDropdown(event);
        }
    });
}

function closeAllDropdowns() {
    const dropdowns = [
        { element: 'statusDropdown', icon: 'statusFilterIcon' },
        { element: 'categoryDropdown', icon: 'categoryFilterIcon' },
        { element: 'creatorDropdown', icon: 'creatorFilterIcon' },
        { element: 'assignStaffDropdown', icon: 'assignStaffIcon' },
        { element: 'priorityDropdown', icon: 'priorityIcon' },
        { element: 'categorySearchDropdown', icon: 'categoryIcon' },
        { element: 'quickTaskStaffDropdown', icon: 'quickTaskStaffIcon' }
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

    document.querySelectorAll('.status-dropdown-menu').forEach(dropdown => {
        dropdown.remove();
    });
}

function toggleDropdown(dropdownId, iconId) {
    const dropdown = document.getElementById(dropdownId);
    const icon = document.getElementById(iconId);

    if (!dropdown || !icon) return;

    const isHidden = dropdown.classList.contains('hidden');
    closeAllDropdowns();

    if (isHidden) {
        dropdown.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    }
}

// Toggle filter container
function toggleFilters() {
    const container = document.getElementById('filterContainer');
    if (container) {
        container.classList.toggle('hidden');
    }
}

// Individual dropdown toggle functions
function toggleStatusDropdown() {
    toggleDropdown('statusDropdown', 'statusFilterIcon');
}

function toggleCategoryDropdown() {
    toggleDropdown('categoryDropdown', 'categoryFilterIcon');
}

function toggleCreatorDropdown() {
    toggleDropdown('creatorDropdown', 'creatorFilterIcon');
}

function toggleAssignStaffDropdown() {
    toggleDropdown('assignStaffDropdown', 'assignStaffIcon');
}

function togglePriorityDropdown() {
    toggleDropdown('priorityDropdown', 'priorityIcon');
}

function toggleCategorySearchDropdown() {
    toggleDropdown('categorySearchDropdown', 'categoryIcon');
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

function selectCreatorFilter(value) {
    currentFilters.creator = value;
    document.getElementById('creatorFilterText').textContent = value === 'all' ? 'All Creators' : value;
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
    uploadedImages = [];
    updateImagePreview();
    showTab('dashboard');
}

// == CLEAR FILTERS ==
function clearAllFilters() {
    showCompletedWorks = false;
    showUnpaidWorks = false; // UPDATED: Clear unpaid filter
    currentFilters = {
        member: 'all',
        status: 'all',
        deadline: 'all',
        creator: 'all',
        category: 'all'
    };

    currentSearchTerm = '';
    document.getElementById('workSearchInput').value = '';

    document.getElementById('statusFilterText').textContent = 'All Status';
    document.getElementById('categoryFilterText').textContent = 'All Categories';
    document.getElementById('creatorFilterText').textContent = 'All Creators';

    selectMemberTile('all');

    closeAllDropdowns();
    renderWorks();
    updateMemberTiles();
    updateStats();
    showNotification('🔄 All filters cleared', 'info');
}

// == MEMBER TILES ==
function selectMemberTile(member) {
    document.querySelectorAll('.member-tile').forEach(tile => {
        tile.classList.remove('active');
    });

    const tiles = document.querySelectorAll('.member-tile');
    tiles.forEach(tile => {
        if ((member === 'all' && tile.textContent.includes('All')) ||
            (member !== 'all' && tile.textContent.includes(member))) {
            tile.classList.add('active');
        }
    });

    currentFilters.member = member;
    renderWorks();
}

function updateMemberTiles() {
    // UPDATED: Exclude unpaid works from member tile counts unless showing unpaid
    let worksToCount = works;
    if (!showCompletedWorks && !showUnpaidWorks) {
        worksToCount = works.filter(w => w.status !== 'Completed' && w.status !== 'Unpaid');
    } else if (showCompletedWorks) {
        worksToCount = works.filter(w => w.status === 'Completed');
    } else if (showUnpaidWorks) {
        worksToCount = works.filter(w => w.status === 'Unpaid');
    }

    const counts = {
        all: worksToCount.length,
        Irshad: worksToCount.filter(w => w.assigned_staff === 'Irshad').length,
        Niyas: worksToCount.filter(w => w.assigned_staff === 'Niyas').length,
        Muhammed: worksToCount.filter(w => w.assigned_staff === 'Muhammed').length,
        Noora: worksToCount.filter(w => w.assigned_staff === 'Noora').length,
        Safvan: worksToCount.filter(w => w.assigned_staff === 'Safvan').length
    };

    const countElements = [
        { id: 'allCount', count: counts.all },
        { id: 'irshadCount', count: counts.Irshad },
        { id: 'niyasCount', count: counts.Niyas },
        { id: 'muhammedCount', count: counts.Muhammed },
        { id: 'nooraCount', count: counts.Noora },
        { id: 'safvanCount', count: counts.Safvan }
    ];

    countElements.forEach(({ id, count }) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = `${count} works`;
        }
    });
}

// == UPDATED: DASHBOARD NAVIGATION WITH UNPAID SUPPORT ==
function goToWorksWithFilter(filterType) {
    showTab('works');

    // Reset filter states
    showCompletedWorks = false;
    showUnpaidWorks = false;

    if (filterType === 'Active') {
        // Show pending + in progress + proof works
        currentFilters.status = 'all';
        currentFilters.member = 'all';
        renderWorks();
    } else if (filterType === 'Completed') {
        showCompletedWorks = true;
        selectStatusFilter('Completed');
    } else if (filterType === 'Unpaid') {
        // UPDATED: New unpaid filter
        showUnpaidWorks = true;
        selectStatusFilter('Unpaid');
    } else if (filterType === 'today') {
        currentFilters.deadline = 'today';
        renderWorks();
    } else if (filterType === 'all') {
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
                showNotification('✅ Browser notifications enabled successfully!', 'success');
            } else {
                showNotification('❌ Notification permission denied', 'error');
            }
        });
    } else {
        showNotification('🔔 Notifications are already enabled!', 'info');
    }
}

// == UPDATED: WHATSAPP COPY WITH NOTIFICATION ==
function copyToClipboard(text, buttonElement) {
    navigator.clipboard.writeText(text).then(() => {
        // Show simple "Copied!" near the button
        const copiedText = document.createElement('div');
        copiedText.textContent = 'Copied!';
        copiedText.className = 'absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600 text-white text-xs px-2 py-1 rounded shadow-lg z-50';
        buttonElement.appendChild(copiedText);

        // Remove after 2 seconds
        setTimeout(() => {
            if (copiedText.parentNode) {
                copiedText.remove();
            }
        }, 2000);

        // Also show the toast notification
        showNotification('📋 WhatsApp number copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('❌ Failed to copy to clipboard', 'error');
    });
}


// == USER AUTHENTICATION ==
function loginUser(name, role) {
    currentUser = name;
    currentUserRole = role;

    localStorage.setItem('currentUser', name);
    localStorage.setItem('currentUserRole', role);

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userName').textContent = name;
    document.getElementById('profileUserName').textContent = name;
    document.getElementById('userAvatar').src = memberAvatars[name];

    Promise.all([
        refreshWorks(),
        refreshCategories(),
        refreshQuickTasks()
    ]).then(() => {
        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        subscribeToQuickTasks();

        renderWorks();
        updateStats();
        updateMemberTiles();
        showTab('dashboard');

        showNotification(`👋 Welcome back, ${name}!`, 'success');
    });
}

function executeLogout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserRole');

    currentUser = null;
    currentUserRole = null;
    sessionId = null;
    works = [];
    categories = [];
    quickTasks = [];
    showCompletedWorks = false;
    showUnpaidWorks = false;
    uploadedImages = [];
    editUploadedImages = [];
    currentWorkImages = [];

    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');

    resetForm();

    showNotification('👋 Logged out successfully', 'info');
}

// == SETUP MEMBER FILTERS ==
function setupMemberFilters() {
    // All staff can see all members' works
}

// == REAL-TIME SUBSCRIPTIONS ==
function subscribeToWorks() {
    sb
        .channel('works-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'works' },
            async (payload) => {
                console.log('🔄 Works table changed:', payload);
                setTimeout(async () => {
                    await refreshWorks();
                }, 500);
            }
        )
        .subscribe();
}

function subscribeToNotifications() {
    sb
        .channel('notifications-changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications' },
            (payload) => {
                const notification = payload.new;
                if (notification.recipient_user === currentUser &&
                    notification.session_id !== sessionId) {
                    showBrowserNotification(notification.title, {
                        body: notification.message,
                        icon: memberAvatars[notification.sender_user],
                        tag: notification.notification_type
                    });
                }
            }
        )
        .subscribe();
}

function subscribeToQuickTasks() {
    sb
        .channel('quick-tasks-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'quick_tasks' },
            async (payload) => {
                console.log('🔄 Quick tasks table changed:', payload);
                setTimeout(async () => {
                    await refreshQuickTasks();
                }, 500);
            }
        )
        .subscribe();
}

// == WORKS MANAGEMENT ==
async function refreshWorks() {
    try {
        const { data, error } = await sb
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
        showNotification('❌ Failed to refresh works', 'error');
    }
}

// == UPDATED: FILTER WORKS WITH UNPAID EXCLUSION ==
function filterWorks() {
    let filteredWorks = [...works];

    // Apply search filter first
    if (currentSearchTerm) {
        filteredWorks = filteredWorks.filter(work => {
            const term = currentSearchTerm.replace(/\s+/g, '');
            const workName = (work.work_name || '').toLowerCase();
            const description = (work.description || '').toLowerCase();
            const whatsappNumber = (work.whatsapp_number || '').replace(/\s+/g, '').toLowerCase();
            const category = (work.category || '').toLowerCase();

            return workName.includes(currentSearchTerm) ||
                description.includes(currentSearchTerm) ||
                whatsappNumber.includes(term) ||
                category.includes(currentSearchTerm);
        });
    }

    // UPDATED: Handle different view modes
    if (showUnpaidWorks) {
        // Show only unpaid works
        filteredWorks = filteredWorks.filter(work => work.status === 'Unpaid');
    } else if (showCompletedWorks) {
        // Show only completed works
        filteredWorks = filteredWorks.filter(work => work.status === 'Completed');
    } else {
        // UPDATED: Exclude both completed and unpaid works from main view
        filteredWorks = filteredWorks.filter(work =>
            work.status !== 'Completed' && work.status !== 'Unpaid'
        );
    }

    if (currentFilters.member !== 'all') {
        filteredWorks = filteredWorks.filter(work =>
            work.assigned_staff === currentFilters.member
        );
    }

    if (currentFilters.status !== 'all') {
        filteredWorks = filteredWorks.filter(work =>
            work.status === currentFilters.status
        );
    }

    if (currentFilters.category !== 'all') {
        filteredWorks = filteredWorks.filter(work =>
            work.category === currentFilters.category
        );
    }

    if (currentFilters.creator !== 'all') {
        filteredWorks = filteredWorks.filter(work =>
            work.created_by === currentFilters.creator
        );
    }

    if (currentFilters.deadline !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        filteredWorks = filteredWorks.filter(work => {
            if (!work.deadline) return currentFilters.deadline === 'all';

            const workDeadline = new Date(work.deadline);
            workDeadline.setHours(0, 0, 0, 0);

            switch (currentFilters.deadline) {
                case 'today':
                    return workDeadline.getTime() === today.getTime();
                default:
                    return true;
            }
        });
    }

    // Default sorting by overdue and pending first
    filteredWorks.sort((a, b) => {
        const aOverdue = isOverdue(a);
        const bOverdue = isOverdue(b);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        const aPending = a.status === 'Pending';
        const bPending = b.status === 'Pending';
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;

        return new Date(b.created_at) - new Date(a.created_at);
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

// == UPDATED: WORK CARD WITH PROPER STATUS OPTIONS ==
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
        'Proof': 'bg-purple-100 text-purple-800',
        'Unpaid': 'bg-red-100 text-red-800',
        'Completed': 'bg-green-100 text-green-800'
    };

    const isUpdating = statusUpdateInProgress.has(work.id);

    const imageThumbnail = work.images && work.images.length > 0 ? `
        <div class="mt-3 mb-2">
            <div class="flex gap-2 overflow-x-auto">
                ${work.images.slice(0, 3).map(img => `
                    <img src="${img}" alt="Work image" class="w-12 h-12 object-cover rounded border cursor-pointer flex-shrink-0" onclick="event.stopPropagation(); viewImage('${img}')">
                `).join('')}
                ${work.images.length > 3 ? `<div class="w-12 h-12 bg-gray-100 rounded border flex items-center justify-center text-xs text-gray-600 flex-shrink-0">+${work.images.length - 3}</div>` : ''}
            </div>
        </div>
    ` : '';

    return `
        <div class="work-card p-6 animate-fade-in ${isOverdueWork ? 'ring-2 ring-red-200 bg-red-50' : ''}" onclick="showWorkDetails(${work.id})">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1 min-w-0 pr-2">
                    <h3 class="font-semibold text-gray-800 text-lg mb-1 truncate ${isOverdueWork ? 'text-red-800' : ''}">${work.work_name}</h3>
                    <p class="text-sm text-gray-600 mb-2 truncate">${work.category || 'No Category'}</p>
                </div>
                <div class="status-dropdown flex-shrink-0">
                    <button class="status-button ${statusColors[work.status] || 'bg-gray-100 text-gray-800'} ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}" 
                            onclick="event.stopPropagation(); ${!isUpdating ? `showStatusDropdown(${work.id}, '${work.status}', this)` : ''}"
                            ${isUpdating ? 'disabled' : ''}>
                        ${isUpdating ? '<div class="loading-spinner"></div>' : work.status}
                        ${!isUpdating ? '<svg class="w-3 h-3 ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' : ''}
                    </button>
                </div>
            </div>
            
            ${imageThumbnail}
            
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <img src="${avatar}" alt="${work.assigned_staff}" class="w-8 h-8 rounded-full object-cover flex-shrink-0">
                    <span class="text-sm font-medium text-gray-700 truncate">${work.assigned_staff}</span>
                </div>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${priorityColors[work.priority] || 'bg-gray-100 text-gray-800'} flex-shrink-0 ml-2">
                    ${work.priority}
                </span>
            </div>
            
            <div class="flex items-center justify-between text-sm text-gray-500">
                <div class="flex items-center gap-4 min-w-0 flex-1">
                    <div class="flex items-center gap-1 ${isOverdueWork ? 'text-red-600 font-medium' : ''} min-w-0">
                        <svg class="w-4 h-4 ${isOverdueWork ? 'text-red-500' : ''} flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span class="truncate">${deadlineText}</span>
                        ${isOverdueWork ? '<span class="text-red-500 font-bold flex-shrink-0">⚠️</span>' : ''}
                    </div>
                    ${work.whatsapp_number ? `
                        <button onclick="event.stopPropagation(); copyToClipboard('${work.whatsapp_number}', this)" 
                            class="flex items-center gap-1 text-green-600 hover:text-green-700 transition-colors flex-shrink-0 relative">

                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.394"></path>
                            </svg>
                            <span class="hidden sm:inline">${work.whatsapp_number}</span>
                        </button>
                    ` : ''}
                </div>
                <div class="text-xs text-gray-400 flex-shrink-0 ml-2">
                    ${formatRelativeTime(work.created_at)}
                </div>
            </div>
            
            <div class="flex justify-end items-center mt-4 pt-4 border-t border-gray-100">
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

// == STATUS DROPDOWN ==
function showStatusDropdown(workId, currentStatus, buttonElement) {
    document.querySelectorAll('.status-dropdown-menu').forEach(dropdown => {
        dropdown.remove();
    });

    const statusOptions = [
        { value: 'Pending', color: 'bg-orange-100 text-orange-800', icon: '⏳' },
        { value: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: '🔄' },
        { value: 'Proof', color: 'bg-purple-100 text-purple-800', icon: '🎯' },
        { value: 'Unpaid', color: 'bg-red-100 text-red-800', icon: '💸' },
        { value: 'Completed', color: 'bg-green-100 text-green-800', icon: '✅' }
    ];

    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown-menu animate-slide-down';

    dropdown.innerHTML = statusOptions.map(option => `
        <button onclick="changeWorkStatusOnly(${workId}, '${option.value}'); this.closest('.status-dropdown-menu').remove();" 
                class="w-full text-left hover:bg-gray-50 transition-colors ${option.value === currentStatus ? 'bg-gray-100 font-medium' : ''}">
            <span>${option.icon}</span>
            <span class="px-2 py-1 rounded-full text-xs ${option.color}">${option.value}</span>
        </button>
    `).join('');

    const container = buttonElement.closest('.status-dropdown');
    container.appendChild(dropdown);

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== buttonElement) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 100);
}

// == STATUS CHANGE FUNCTION ==
async function changeWorkStatusOnly(workId, newStatus) {
    if (statusUpdateInProgress.has(workId)) return;

    statusUpdateInProgress.add(workId);

    try {
        const { error } = await sb
            .from('works')
            .update({ status: newStatus })
            .eq('id', workId);

        if (error) throw error;

        const workIndex = works.findIndex(w => w.id === workId);
        if (workIndex !== -1) {
            works[workIndex].status = newStatus;
            works[workIndex].updated_at = new Date().toISOString();
        }

        renderWorks();
        updateStats();
        updateMemberTiles();
        updateRecentActivity();

        showNotification(`✅ Status updated to ${newStatus}`, 'success');

        const work = works.find(w => w.id === workId);
        if (work) {
            showBrowserNotification('🔄 Status Updated', {
                body: `"${work.work_name}" is now ${newStatus}`,
                tag: 'status-change'
            });
        }

        setTimeout(async () => {
            await refreshWorks();
        }, 1000);

    } catch (error) {
        console.error('Error updating work status:', error);
        showNotification('❌ Failed to update status', 'error');
        await refreshWorks();
    } finally {
        statusUpdateInProgress.delete(workId);
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
        'Proof': 'bg-purple-100 text-purple-800',
        'Unpaid': 'bg-red-100 text-red-800',
        'Completed': 'bg-green-100 text-green-800'
    };

    const isOverdueWork = isOverdue(work);
    const deadlineText = formatDeadline(work);

    const imagesSection = work.images && work.images.length > 0 ? `
        <div>
            <h4 class="font-semibold text-gray-800 mb-2">Images (${work.images.length})</h4>
            <div class="image-gallery">
                ${work.images.map(img => `
                    <div class="image-item">
                        <img src="${img}" alt="Work image" onclick="viewImage('${img}')">
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    const content = `
        <div class="space-y-6">
            <div class="border-b border-gray-200 pb-4">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-xl font-bold text-gray-800">${work.work_name}</h3>
                    ${isOverdueWork ? '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full animate-pulse">⚠️ Overdue</span>' : ''}
                </div>
                <div class="flex items-center gap-2 mb-2">
                    <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColors[work.status]}">${work.status}</span>
                    <span class="px-3 py-1 rounded-full text-sm font-medium ${priorityColors[work.priority]}">${work.priority} Priority</span>
                </div>
                <p class="text-gray-600">${work.category || 'No Category'}</p>
            </div>
            
            ${work.description ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Description</h4>
                    <p class="text-gray-600 bg-gray-50 p-3 rounded-lg">${work.description}</p>
                </div>
            ` : ''}
            
            ${imagesSection}
            
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
            
            ${work.deadline ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Deadline</h4>
                    <div class="flex items-center gap-2 bg-gray-50 p-3 rounded-lg ${isOverdueWork ? 'bg-red-50' : ''}">
                        <svg class="w-5 h-5 text-gray-600 ${isOverdueWork ? 'text-red-500' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span class="text-gray-800 font-medium ${isOverdueWork ? 'text-red-800' : ''}">${deadlineText}</span>
                        ${isOverdueWork ? '<span class="text-red-600 text-sm font-bold">(⚠️ Overdue)</span>' : ''}
                    </div>
                </div>
            ` : ''}
            
            ${work.whatsapp_number ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Contact</h4>
                    <button onclick="copyToClipboard('${work.whatsapp_number}', this)" 
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
    currentWorkImages = work.images ? [...work.images] : [];
    editUploadedImages = [];

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

    updateEditImagePreview();
    document.getElementById('editWorkModal').classList.remove('hidden');
}

async function executeDeleteWork(workId) {
    try {
        const { error } = await sb
            .from('works')
            .delete()
            .eq('id', workId);

        if (error) throw error;

        await refreshWorks();
        showNotification('✅ Work deleted successfully!', 'success');

    } catch (error) {
        console.error('Error deleting work:', error);
        showNotification('❌ Failed to delete work', 'error');
    }
}

// == UTILITY FUNCTIONS ==
function isOverdue(work) {
    if (!work.deadline || work.status === 'Completed') return false;

    const today = new Date();
    const deadline = new Date(work.deadline);

    if (work.deadline_time) {
        const [hours, minutes] = work.deadline_time.split(':');
        deadline.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        return deadline < today;
    } else {
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

// == UPDATED: STATS WITH ACTIVE WORKS AND UNPAID ==
function updateStats() {
    const totalWorksElement = document.getElementById('totalWorks');
    const activeWorksElement = document.getElementById('activeWorks');
    const unpaidWorksElement = document.getElementById('unpaidWorks');
    const completedWorksElement = document.getElementById('completedWorks');
    const dueTodayWorksElement = document.getElementById('dueTodayWorks');

    if (totalWorksElement) totalWorksElement.textContent = works.length;
    if (activeWorksElement) activeWorksElement.textContent = works.filter(w =>
        w.status === 'Pending' || w.status === 'In Progress' || w.status === 'Proof'
    ).length;
    if (unpaidWorksElement) unpaidWorksElement.textContent = works.filter(w => w.status === 'Unpaid').length;
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

function updateRecentActivity() {
    const recentActivityElement = document.getElementById('recentActivity');
    if (!recentActivityElement) return;

    const recentWorks = works
        .sort((a, b) => {
            const aDate = new Date(a.updated_at || a.created_at);
            const bDate = new Date(b.updated_at || b.created_at);
            return bDate - aDate;
        })
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
            'Proof': 'bg-purple-100 text-purple-800',
            'Unpaid': 'bg-red-100 text-red-800',
            'Completed': 'bg-green-100 text-green-800'
        };

        const activityDate = work.updated_at || work.created_at;
        const isStatusUpdate = work.updated_at && work.updated_at !== work.created_at;
        const activityText = isStatusUpdate ? 'Status updated' : 'Work created';

        return `
            <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onclick="showWorkDetails(${work.id})">
                <img src="${avatar}" alt="${work.assigned_staff}" class="w-8 h-8 rounded-full object-cover">
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-800 truncate">${work.work_name}</div>
                    <div class="text-sm text-gray-600">${activityText} • ${work.assigned_staff}</div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColors[work.status]}">${work.status}</span>
                    <span class="text-xs text-gray-500">${formatRelativeTime(activityDate)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function resetForm() {
    const form = document.getElementById('workForm');
    if (form) {
        form.reset();
    }

    document.getElementById('categoryText').textContent = 'Select Category';
    document.getElementById('assignStaffText').textContent = 'Select Staff Member';
    document.getElementById('priorityText').textContent = 'Medium';

    document.getElementById('workCategory').value = '';
    document.getElementById('assignStaff').value = '';
    document.getElementById('workPriority').value = 'Medium';

    const categorySearch = document.getElementById('categorySearch');
    if (categorySearch) {
        categorySearch.value = '';
        filterCategories('');
    }
}

function showTab(tabName) {
    if (tabName !== 'works') {
        currentSearchTerm = '';
        const searchInput = document.getElementById('workSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }
    }

    if (tabName !== 'dashboard') {
        showCompletedWorks = false;
        showUnpaidWorks = false;
    }

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('bg-primary', 'text-white');
        tab.classList.add('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
    });

    const activeTab = document.getElementById(tabName + 'Tab');
    if (activeTab) {
        activeTab.classList.add('bg-primary', 'text-white');
        activeTab.classList.remove('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
    }

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    const activeContent = document.getElementById(tabName + 'Content');
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }

    if (tabName === 'works') {
        renderWorks();
        updateMemberTiles();
    } else if (tabName === 'dashboard') {
        updateStats();
        updateRecentActivity();
    } else if (tabName === 'tasks') {
        renderQuickTasks();
    }
}

// == MY WORKS NAVIGATION ==
function showMyWorks() {
    if (currentUser) {
        currentFilters.member = currentUser;

        // Update member tiles visual state
        document.querySelectorAll('.member-tile').forEach(tile => {
            tile.classList.remove('active');
            if (tile.textContent.includes(currentUser)) {
                tile.classList.add('active');
            }
        });

        showTab('works');
    } else {
        showTab('works');
    }
}

// == EXPOSE FUNCTIONS TO GLOBAL SCOPE ==
window.loginUser = loginUser;
window.showMyWorks = showMyWorks;
window.showTab = showTab;
window.showWorkDetails = showWorkDetails;
window.editWork = editWork;
window.executeDeleteWork = executeDeleteWork;
window.changeWorkStatusOnly = changeWorkStatusOnly;
window.showStatusDropdown = showStatusDropdown;
window.copyToClipboard = copyToClipboard;
window.toggleNotifications = toggleNotifications;
window.showLogoutConfirmation = showLogoutConfirmation;
window.closeLogoutConfirmModal = closeLogoutConfirmModal;
window.confirmLogout = confirmLogout;
// == EXPOSE FUNCTIONS TO GLOBAL SCOPE (CONTINUED) ==
window.showDeleteConfirmation = showDeleteConfirmation;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.confirmDelete = confirmDelete;
window.closeWorkDetailsModal = closeWorkDetailsModal;
window.closeEditModal = closeEditModal;
window.closeAddCategoryModal = closeAddCategoryModal;
window.showAddCategoryModal = showAddCategoryModal;
window.selectCategory = selectCategory;
window.filterCategories = filterCategories;
window.selectAssignStaff = selectAssignStaff;
window.selectPriority = selectPriority;
window.cancelAddWork = cancelAddWork;
window.clearAllFilters = clearAllFilters;
window.selectMemberTile = selectMemberTile;
window.toggleFilters = toggleFilters;
window.goToWorksWithFilter = goToWorksWithFilter;
window.selectStatusFilter = selectStatusFilter;
window.selectCategoryFilter = selectCategoryFilter;
window.selectCreatorFilter = selectCreatorFilter;
window.toggleStatusDropdown = toggleStatusDropdown;
window.toggleCategoryDropdown = toggleCategoryDropdown;
window.toggleCreatorDropdown = toggleCreatorDropdown;
window.toggleAssignStaffDropdown = toggleAssignStaffDropdown;
window.togglePriorityDropdown = togglePriorityDropdown;
window.toggleCategorySearchDropdown = toggleCategorySearchDropdown;
window.toggleProfileDropdown = toggleProfileDropdown;
window.handleRealtimeSearch = handleRealtimeSearch;

// Quick tasks functions
window.showAddQuickTaskModal = showAddQuickTaskModal;
window.closeAddQuickTaskModal = closeAddQuickTaskModal;
window.selectQuickTaskStaff = selectQuickTaskStaff;
window.setQuickTaskDate = setQuickTaskDate;
window.clearQuickTaskDate = clearQuickTaskDate;
window.toggleQuickTaskStaffDropdown = toggleQuickTaskStaffDropdown;
window.toggleQuickTask = toggleQuickTask;
window.deleteQuickTask = deleteQuickTask;

// Image functions
window.handleImageUpload = handleImageUpload;
window.handleEditImageUpload = handleEditImageUpload;
window.removeImage = removeImage;
window.viewImage = viewImage;
window.closeImageViewer = closeImageViewer;

