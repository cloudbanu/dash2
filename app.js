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
let showCompletedWorks = false;
let statusUpdateInProgress = new Set();
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

// Notes and Todos functionality (user-specific)
let notesAutoSaveTimeout = null;
let currentNotes = '';
let lastSavedNotes = '';
let isSavingNotes = false;

let todoAutoSaveTimeout = null;
let todoItems = [];
let isSavingTodos = false;

// Image upload variables
let uploadedImages = [];
let editUploadedImages = [];

// Global variable to store current work images for editing
let currentWorkImages = [];

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
    
    // Set up drag and drop for image upload
    setupImageUpload();
    
    // Check if user was previously logged in
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
        
        // Initialize app data
        await Promise.all([
            refreshWorks(),
            refreshCategories(),
            loadNotes(),
            loadTodos()
        ]);
        
        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        subscribeToNotes();
        subscribeToTodos();
        
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

// == PROFILE DROPDOWN ==
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdownMenu');
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        // Close dropdown when clicking outside
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
    const editUploadArea = document.getElementById('editImageUploadArea');
    
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
    }
    
    if (editUploadArea) {
        editUploadArea.addEventListener('dragover', handleDragOver);
        editUploadArea.addEventListener('dragleave', handleDragLeave);
        editUploadArea.addEventListener('drop', handleEditDrop);
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

function handleEditDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    processImages(files, true);
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
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showToast('❌ File too large. Maximum size is 10MB', 'error');
            continue;
        }
        
        try {
            // Compress image
            const compressedFile = await compressImage(file, 0.6);
            
            // Upload to Supabase Storage
            const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${file.name.split('.').pop()}`;
            const { data, error } = await supabase.storage
                .from('work-images')
                .upload(fileName, compressedFile);
            
            if (error) throw error;
            
            // Get public URL
            const { data: { publicUrl } } = supabase.storage
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
            showToast('❌ Failed to upload image: ' + file.name, 'error');
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
    
    showToast(`✅ ${processedFiles} image(s) uploaded successfully`, 'success');
}

function compressImage(file, quality) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Calculate new dimensions (max 1920x1080)
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
            
            // Draw and compress
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
    
    // Combine existing images with new uploads
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
            // Remove from current work images
            if (currentWorkImages) {
                currentWorkImages.splice(index, 1);
            }
        } else {
            // Remove from new uploads
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

// == NOTES FUNCTIONALITY ==
async function loadNotes() {
    try {
        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('user_name', currentUser)
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            throw error;
        }
        
        const notesContent = data ? data.content || '' : '';
        currentNotes = notesContent;
        lastSavedNotes = notesContent;
        
        const textarea = document.getElementById('notesTextarea');
        if (textarea) {
            textarea.value = notesContent;
            updateNotesStats();
        }
        
        if (data && data.updated_at) {
            updateLastSavedTime(data.updated_at, 'notes');
        }
    } catch (error) {
        console.error('Error loading notes:', error);
        showToast('❌ Failed to load notes', 'error');
    }
}

async function saveNotes() {
    if (isSavingNotes || currentNotes === lastSavedNotes) return;
    
    isSavingNotes = true;
    showNotesSaveIndicator('saving');
    
    try {
        const { data, error } = await supabase
            .from('notes')
            .upsert({
                user_name: currentUser,
                content: currentNotes
            })
            .select()
            .single();
        
        if (error) throw error;
        
        lastSavedNotes = currentNotes;
        showNotesSaveIndicator('saved');
        updateLastSavedTime(data.updated_at, 'notes');
        
    } catch (error) {
        console.error('Error saving notes:', error);
        showNotesSaveIndicator('error');
        showToast('❌ Failed to save notes', 'error');
    } finally {
        isSavingNotes = false;
    }
}

function handleNotesInput() {
    const textarea = document.getElementById('notesTextarea');
    if (!textarea) return;
    
    currentNotes = textarea.value;
    updateNotesStats();
    
    // Clear previous timeout
    if (notesAutoSaveTimeout) {
        clearTimeout(notesAutoSaveTimeout);
    }
    
    // Show saving indicator immediately
    showNotesSaveIndicator('saving');
    
    // Set new timeout for auto-save
    notesAutoSaveTimeout = setTimeout(() => {
        saveNotes();
    }, 1000); // Save after 1 second of inactivity
}

function updateNotesStats() {
    const textarea = document.getElementById('notesTextarea');
    if (!textarea) return;
    
    const content = textarea.value;
    const characterCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lineCount = content.split('\n').length;
    
    // Update counters
    const charElement = document.getElementById('characterCount');
    const wordElement = document.getElementById('wordCount');
    const lineElement = document.getElementById('lineCount');
    
    if (charElement) charElement.textContent = characterCount.toLocaleString();
    if (wordElement) wordElement.textContent = wordCount.toLocaleString();
    if (lineElement) lineElement.textContent = lineCount.toLocaleString();
}

function showNotesSaveIndicator(status) {
    const indicator = document.getElementById('notesSaveIndicator');
    const statusElement = document.getElementById('notesAutoSaveStatus');
    
    if (!indicator || !statusElement) return;
    
    switch (status) {
        case 'saving':
            indicator.classList.remove('hidden');
            statusElement.textContent = 'Saving...';
            statusElement.className = 'text-yellow-600';
            break;
        case 'saved':
            indicator.classList.add('hidden');
            statusElement.textContent = 'Saved';
            statusElement.className = 'text-green-600';
            break;
        case 'error':
            indicator.classList.add('hidden');
            statusElement.textContent = 'Error';
            statusElement.className = 'text-red-600';
            break;
    }
}

// == TODO FUNCTIONALITY ==
async function loadTodos() {
    try {
        const { data, error } = await supabase
            .from('todos')
            .select('*')
            .eq('user_name', currentUser)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (data && data.todos) {
            todoItems = JSON.parse(data.todos);
        } else {
            todoItems = [];
        }
        
        renderTodos();
        updateTodoStats();
        
        if (data && data.updated_at) {
            updateLastSavedTime(data.updated_at, 'todo');
        }
    } catch (error) {
        console.error('Error loading todos:', error);
        showToast('❌ Failed to load todos', 'error');
    }
}

async function saveTodos() {
    if (isSavingTodos) return;
    
    isSavingTodos = true;
    showTodoSaveIndicator('saving');
    
    try {
        const { data, error } = await supabase
            .from('todos')
            .upsert({
                user_name: currentUser,
                todos: JSON.stringify(todoItems)
            })
            .select()
            .single();
        
        if (error) throw error;
        
        showTodoSaveIndicator('saved');
        updateLastSavedTime(data.updated_at, 'todo');
        
    } catch (error) {
        console.error('Error saving todos:', error);
        showTodoSaveIndicator('error');
        showToast('❌ Failed to save todos', 'error');
    } finally {
        isSavingTodos = false;
    }
}

function addTodo() {
    const input = document.getElementById('newTodoInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const newTodo = {
        id: Date.now(),
        text: text,
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    todoItems.unshift(newTodo);
    input.value = '';
    renderTodos();
    updateTodoStats();
    saveTodos();
}

function handleTodoKeyPress(event) {
    if (event.key === 'Enter') {
        addTodo();
    }
}

function toggleTodo(todoId) {
    const todo = todoItems.find(t => t.id === todoId);
    if (todo) {
        todo.completed = !todo.completed;
        renderTodos();
        updateTodoStats();
        saveTodos();
    }
}

function deleteTodo(todoId) {
    todoItems = todoItems.filter(t => t.id !== todoId);
    renderTodos();
    updateTodoStats();
    saveTodos();
}

function renderTodos() {
    const container = document.getElementById('todosList');
    if (!container) return;
    
    if (todoItems.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                </svg>
                <p>No tasks yet. Add your first task above!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = todoItems.map(todo => `
        <div class="todo-item ${todo.completed ? 'completed' : ''}">
            <div class="todo-checkbox ${todo.completed ? 'checked' : ''}" onclick="toggleTodo(${todo.id})">
                ${todo.completed ? '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
            </div>
            <div class="todo-text flex-1">${todo.text}</div>
            <button onclick="deleteTodo(${todo.id})" class="text-red-400 hover:text-red-600 p-1 rounded transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
    `).join('');
}

function updateTodoStats() {
    const totalElement = document.getElementById('totalTodos');
    const completedElement = document.getElementById('completedTodos');
    
    if (totalElement) totalElement.textContent = todoItems.length;
    if (completedElement) completedElement.textContent = todoItems.filter(t => t.completed).length;
}

function showTodoSaveIndicator(status) {
    const indicator = document.getElementById('todoSaveIndicator');
    const statusElement = document.getElementById('todoAutoSaveStatus');
    
    if (!indicator || !statusElement) return;
    
    switch (status) {
        case 'saving':
            indicator.classList.remove('hidden');
            statusElement.textContent = 'Saving...';
            statusElement.className = 'text-yellow-600';
            break;
        case 'saved':
            indicator.classList.add('hidden');
            statusElement.textContent = 'Saved';
            statusElement.className = 'text-green-600';
            break;
        case 'error':
            indicator.classList.add('hidden');
            statusElement.textContent = 'Error';
            statusElement.className = 'text-red-600';
            break;
    }
}

function updateLastSavedTime(timestamp, type) {
    const elementId = type === 'todo' ? 'todoLastSaved' : 'notesLastSaved';
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    let timeText;
    if (diffInSeconds < 60) {
        timeText = 'Saved just now';
    } else if (diffInSeconds < 3600) {
        timeText = `Saved ${Math.floor(diffInSeconds / 60)} minutes ago`;
    } else if (diffInSeconds < 86400) {
        timeText = `Saved ${Math.floor(diffInSeconds / 3600)} hours ago`;
    } else {
        timeText = `Saved on ${date.toLocaleDateString()}`;
    }
    
    element.textContent = timeText;
}

function clearNotes() {
    document.getElementById('clearNotesModal').classList.remove('hidden');
}

function closeClearNotesModal() {
    document.getElementById('clearNotesModal').classList.add('hidden');
}

async function confirmClearNotes() {
    const textarea = document.getElementById('notesTextarea');
    if (textarea) {
        textarea.value = '';
        currentNotes = '';
        updateNotesStats();
        await saveNotes();
    }
    closeClearNotesModal();
    showToast('🗑️ All notes cleared', 'info');
}

function clearTodos() {
    document.getElementById('clearTodosModal').classList.remove('hidden');
}

function closeClearTodosModal() {
    document.getElementById('clearTodosModal').classList.add('hidden');
}

async function confirmClearTodos() {
    todoItems = [];
    renderTodos();
    updateTodoStats();
    await saveTodos();
    closeClearTodosModal();
    showToast('🗑️ All todos cleared', 'info');
}

function copyNotesToClipboard() {
    const content = document.getElementById('notesTextarea')?.value || '';
    if (!content.trim()) {
        showToast('❌ No notes to copy', 'error');
        return;
    }
    
    navigator.clipboard.writeText(content).then(() => {
        showToast('📋 Notes copied to clipboard', 'success');
    }).catch(() => {
        showToast('❌ Failed to copy notes', 'error');
    });
}

function subscribeToNotes() {
    supabase
        .channel('notes-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'notes' },
            (payload) => {
                console.log('🔄 Notes table changed:', payload);
                // Only reload if it's for current user and not from current session
                if (payload.new && payload.new.user_name === currentUser) {
                    const textarea = document.getElementById('notesTextarea');
                    if (textarea && payload.new.content !== textarea.value) {
                        // Another session updated the notes
                        loadNotes();
                    }
                }
            }
        )
        .subscribe();
}

function subscribeToTodos() {
    supabase
        .channel('todos-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'todos' },
            (payload) => {
                console.log('🔄 Todos table changed:', payload);
                if (payload.new && payload.new.user_name === currentUser) {
                    loadTodos();
                }
            }
        )
        .subscribe();
}

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
            } else if (!document.getElementById('clearNotesModal').classList.contains('hidden')) {
                closeClearNotesModal();
            } else if (!document.getElementById('clearTodosModal').classList.contains('hidden')) {
                closeClearTodosModal();
            } else if (!document.getElementById('logoutConfirmModal').classList.contains('hidden')) {
                closeLogoutConfirmModal();
            } else if (!document.getElementById('unsavedChangesModal').classList.contains('hidden')) {
                closeUnsavedChangesModal();
            } else if (!document.getElementById('imageViewerModal').classList.contains('hidden')) {
                closeImageViewer();
            } else {
                // Close dropdowns
                closeAllDropdowns();
                closeProfileDropdown({ target: document.body });
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
    
    // Clear edit images
    editUploadedImages = [];
    currentWorkImages = [];
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
            editUploadedImages = [];
            currentWorkImages = [];
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
                created_by: currentUser,
                images: uploadedImages.map(img => img.url)
            };
            
            try {
                const { data, error } = await supabase
                    .from('works')
                    .insert([workData])
                    .select();
                
                if (error) throw error;
                
                resetForm();
                resetUnsavedChanges();
                uploadedImages = [];
                updateImagePreview();
                await refreshWorks();
                showTab('works');
                showToast('✅ Work added successfully!', 'success');
                
                // Enhanced notification - only show to other staff members
                if (assignedStaff !== currentUser) {
                    showEnhancedNotification(
                        `${currentUser} added a new work for ${assignedStaff}`,
                        `"${workData.work_name}" has been assigned`,
                        memberAvatars[assignedStaff],
                        assignedStaff
                    );
                }
                
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
    
    // Edit work form handler - REMOVED CONFIRMATION, DIRECT UPDATE
    const editWorkForm = document.getElementById('editWorkForm');
    if (editWorkForm) {
        editWorkForm.addEventListener('submit', async function(e) {
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
                const { error } = await supabase
                    .from('works')
                    .update(updatedWork)
                    .eq('id', editingWorkId);
                
                if (error) {
                    if (error.message && (error.message.includes('mrp') || error.message.includes('quotation_rate'))) {
                        const { mrp, quotation_rate, ...workWithoutPricing } = updatedWork;
                        
                        const { error: retryError } = await supabase
                            .from('works')
                            .update(workWithoutPricing)
                            .eq('id', editingWorkId);
                        
                        if (retryError) throw retryError;
                        
                        showToast('⚠️ Work updated (pricing fields not available)', 'warning');
                    } else {
                        throw error;
                    }
                } else {
                    showToast('✅ Work updated successfully!', 'success');
                }
                
                // DIRECT CLOSE WITHOUT CONFIRMATION
                const modal = document.getElementById('editWorkModal');
                if (modal) {
                    modal.classList.add('hidden');
                }
                editingWorkId = null;
                resetUnsavedChanges();
                editUploadedImages = [];
                currentWorkImages = [];
                
                await refreshWorks();
                
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

    setTimeout(trackChanges, 100);
}

// == ENHANCED NOTIFICATIONS ==
function showEnhancedNotification(title, body, avatarUrl, targetUser) {
    // Only show to other users, not the creator
    if (targetUser !== currentUser) {
        showBrowserNotification(title, {
            body: body,
            icon: avatarUrl,
            tag: 'new-work-assignment'
        });
    }
}

// == DROPDOWN MANAGEMENT ==
function setupDropdownHandlers() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
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

    // Close all status dropdowns
    document.querySelectorAll('.status-dropdown-menu').forEach(dropdown => {
        dropdown.remove();
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
    uploadedImages = [];
    updateImagePreview();
    showTab('dashboard');
}

// == CLEAR FILTERS ==
function clearAllFilters() {
    showCompletedWorks = false; // Reset completed works flag
    currentFilters = {
        member: 'all', // Allow all staff to see all works
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
    selectMemberTile('all');
    
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
    // Count works for each member (excluding completed works unless specifically showing them)
    const worksToCount = showCompletedWorks ? works : works.filter(w => w.status !== 'Completed');
    
    const counts = {
        all: worksToCount.length,
        Irshad: worksToCount.filter(w => w.assigned_staff === 'Irshad').length,
        Niyas: worksToCount.filter(w => w.assigned_staff === 'Niyas').length,
        Muhammed: worksToCount.filter(w => w.assigned_staff === 'Muhammed').length,
        Najil: worksToCount.filter(w => w.assigned_staff === 'Najil').length,
        Safvan: worksToCount.filter(w => w.assigned_staff === 'Safvan').length
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
    
    if (filterType === 'Pending') {
        showCompletedWorks = false;
        selectStatusFilter('Pending');
    } else if (filterType === 'In Progress') {
        showCompletedWorks = false;
        selectStatusFilter('In Progress');
    } else if (filterType === 'Completed') {
        showCompletedWorks = true;
        selectStatusFilter('Completed');
    } else if (filterType === 'today') {
        showCompletedWorks = false;
        selectDeadlineFilter('today');
    } else if (filterType === 'all') {
        showCompletedWorks = false;
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
    document.getElementById('profileUserName').textContent = name;
    document.getElementById('userAvatar').src = memberAvatars[name];
    
    // Initialize app data
    Promise.all([
        refreshWorks(),
        refreshCategories(),
        loadNotes(),
        loadTodos()
    ]).then(() => {
        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        subscribeToNotes();
        subscribeToTodos();
        
        renderWorks();
        updateStats();
        updateMemberTiles();
        showTab('dashboard');
        
        showToast(`👋 Welcome back, ${name}!`, 'success');
    });
}

function executeLogout() {
    // Save notes and todos before logout
    if (currentNotes !== lastSavedNotes) {
        saveNotes();
    }
    if (todoItems.length > 0) {
        saveTodos();
    }
    
    // Clear saved login state
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserRole');
    
    // Reset global state
    currentUser = null;
    currentUserRole = null;
    works = [];
    categories = [];
    showCompletedWorks = false;
    currentNotes = '';
    lastSavedNotes = '';
    todoItems = [];
    uploadedImages = [];
    editUploadedImages = [];
    currentWorkImages = [];
    
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
    // All staff can now see all members' works - no restrictions
}

// == REAL-TIME SUBSCRIPTIONS ==
function subscribeToWorks() {
    supabase
        .channel('works-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'works' },
            async (payload) => {
                console.log('🔄 Works table changed:', payload);
                // Force refresh after a small delay to ensure consistency
                setTimeout(async () => {
                    await refreshWorks();
                }, 500);
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
                    showEnhancedNotification(
                        `${newWork.created_by} added a new work for you`,
                        `"${newWork.work_name}" has been assigned to you`,
                        memberAvatars[newWork.assigned_staff],
                        newWork.assigned_staff
                    );
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
    
    // Filter out completed works unless specifically showing them
    if (!showCompletedWorks) {
        filteredWorks = filteredWorks.filter(work => work.status !== 'Completed');
    }
    
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
                const statusOrder = { 'Pending': 0, 'In Progress': 1, 'Proof': 2, 'Completed': 3 };
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
        'Proof': 'bg-purple-100 text-purple-800',
        'Completed': 'bg-green-100 text-green-800'
    };
    
    // Fixed overdue indicator - made it properly visible
    const overdueIndicator = isOverdueWork ? `
        <div class="overdue-indicator">
            <div class="overdue-dot">
                <div class="overdue-ping"></div>
            </div>
        </div>
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-red-600 rounded-t-lg animate-pulse"></div>
    ` : '';
    
    // Check if work is being updated
    const isUpdating = statusUpdateInProgress.has(work.id);
    
    // Generate image thumbnail if images exist
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
            ${overdueIndicator}
            
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
                        <button onclick="event.stopPropagation(); copyToClipboard('${work.whatsapp_number}')" 
                                class="flex items-center gap-1 text-green-600 hover:text-green-700 transition-colors flex-shrink-0">
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

// == IMPROVED STATUS DROPDOWN FUNCTION ==
function showStatusDropdown(workId, currentStatus, buttonElement) {
    // Close any existing status dropdowns
    document.querySelectorAll('.status-dropdown-menu').forEach(dropdown => {
        dropdown.remove();
    });
    
    const statusOptions = [
        { value: 'Pending', color: 'bg-orange-100 text-orange-800', icon: '⏳' },
        { value: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: '🔄' },
        { value: 'Proof', color: 'bg-purple-100 text-purple-800', icon: '🎯' },
        { value: 'Completed', color: 'bg-green-100 text-green-800', icon: '✅' }
    ];
    
    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown-menu animate-slide-down';
    
    dropdown.innerHTML = statusOptions.map(option => `
        <button onclick="changeWorkStatus(${workId}, '${option.value}'); this.closest('.status-dropdown-menu').remove();" 
                class="w-full text-left hover:bg-gray-50 transition-colors ${option.value === currentStatus ? 'bg-gray-100 font-medium' : ''}">
            <span>${option.icon}</span>
            <span class="px-2 py-1 rounded-full text-xs ${option.color}">${option.value}</span>
        </button>
    `).join('');
    
    // Position dropdown relative to button
    const container = buttonElement.closest('.status-dropdown');
    container.appendChild(dropdown);
    
    // Close dropdown when clicking outside
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

// == WORK ACTIONS ==
async function changeWorkStatus(workId, newStatus) {
    // Prevent multiple simultaneous updates
    if (statusUpdateInProgress.has(workId)) return;
    
    statusUpdateInProgress.add(workId);
    
    try {
        const { error } = await supabase
            .from('works')
            .update({ status: newStatus })
            .eq('id', workId);
        
        if (error) throw error;
        
        // Update local state immediately for responsiveness
        const workIndex = works.findIndex(w => w.id === workId);
        if (workIndex !== -1) {
            works[workIndex].status = newStatus;
        }
        
        // Re-render immediately
        renderWorks();
        updateStats();
        updateMemberTiles();
        
        showToast(`✅ Status updated to ${newStatus}`, 'success');
        
        // Show browser notification
        const work = works.find(w => w.id === workId);
        if (work) {
            showBrowserNotification('🔄 Status Updated', {
                body: `"${work.work_name}" is now ${newStatus}`,
                tag: 'status-change'
            });
        }
        
        // Force refresh from database after a delay to ensure consistency
        setTimeout(async () => {
            await refreshWorks();
        }, 1000);
        
    } catch (error) {
        console.error('Error updating work status:', error);
        showToast('❌ Failed to update status', 'error');
        
        // Refresh on error to restore correct state
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
        'Completed': 'bg-green-100 text-green-800'
    };
    
    const isOverdueWork = isOverdue(work);
    const deadlineText = formatDeadline(work);
    
    // Generate images section
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
            <!-- Header -->
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
            
            <!-- Description -->
            ${work.description ? `
                <div>
                    <h4 class="font-semibold text-gray-800 mb-2">Description</h4>
                    <p class="text-gray-600 bg-gray-50 p-3 rounded-lg">${work.description}</p>
                </div>
            ` : ''}
            
            ${imagesSection}
            
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
                    <div class="flex items-center gap-2 bg-gray-50 p-3 rounded-lg ${isOverdueWork ? 'bg-red-50' : ''}">
                        <svg class="w-5 h-5 text-gray-600 ${isOverdueWork ? 'text-red-500' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span class="text-gray-800 font-medium ${isOverdueWork ? 'text-red-800' : ''}">${deadlineText}</span>
                        ${isOverdueWork ? '<span class="text-red-600 text-sm font-bold">(⚠️ Overdue)</span>' : ''}
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
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0
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
    
    // Store current work images for editing
    currentWorkImages = work.images ? [...work.images] : [];
    editUploadedImages = [];
    
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
    
    // Update image preview
    updateEditImagePreview();
    
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
    const inProgressWorksElement = document.getElementById('inProgressWorks');
    const completedWorksElement = document.getElementById('completedWorks');
    const dueTodayWorksElement = document.getElementById('dueTodayWorks');
    
    if (totalWorksElement) totalWorksElement.textContent = works.length;
    if (pendingWorksElement) pendingWorksElement.textContent = works.filter(w => w.status === 'Pending').length;
    if (inProgressWorksElement) inProgressWorksElement.textContent = works.filter(w => w.status === 'In Progress').length;
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
            'Proof': 'bg-purple-100 text-purple-800', 
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
    // Reset completed works flag when switching tabs (except when going to dashboard)
    if (tabName !== 'dashboard') {
        showCompletedWorks = false;
    }
    
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
    
    // Update data when switching to specific tabs
    if (tabName === 'works') {
        renderWorks();
        updateMemberTiles();
    } else if (tabName === 'dashboard') {
        updateStats();
        updateRecentActivity();
    } else if (tabName === 'notes') {
        // Update notes stats when switching to notes tab
        updateNotesStats();
        updateTodoStats();
    }
}

// == EXPOSE FUNCTIONS TO GLOBAL SCOPE ==
window.loginUser = loginUser;
window.showTab = showTab;
window.showWorkDetails = showWorkDetails;
window.editWork = editWork;
window.executeDeleteWork = executeDeleteWork;
window.changeWorkStatus = changeWorkStatus;
window.showStatusDropdown = showStatusDropdown;
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
window.toggleProfileDropdown = toggleProfileDropdown;

// Notes functions
window.handleNotesInput = handleNotesInput;
window.clearNotes = clearNotes;
window.closeClearNotesModal = closeClearNotesModal;
window.confirmClearNotes = confirmClearNotes;
window.copyNotesToClipboard = copyNotesToClipboard;

// Todo functions
window.addTodo = addTodo;
window.handleTodoKeyPress = handleTodoKeyPress;
window.toggleTodo = toggleTodo;
window.deleteTodo = deleteTodo;
window.clearTodos = clearTodos;
window.closeClearTodosModal = closeClearTodosModal;
window.confirmClearTodos = confirmClearTodos;

// Image functions
window.handleImageUpload = handleImageUpload;
window.handleEditImageUpload = handleEditImageUpload;
window.removeImage = removeImage;
window.viewImage = viewImage;
window.closeImageViewer = closeImageViewer;
