// == CONFIGURATION ==
const SUPABASE_URL = 'https://icmlxulaxsacuvlkghlz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbWx4dWxheHNhY3V2bGtnaGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTk0MTgsImV4cCI6MjA2ODY5NTQxOH0.zVGLqIpCIlMoSQAInaCybz9bY1zq82IL9DC5uMs1tFQ';

// Member avatars mapping
const memberAvatars = {
    'Irshad': 'irshad.jpg',
    'Niyas': 'niyas.jpg',
    'Muhammed': 'muhammed.jpg',
    'Noora': 'noora.jpg',
    'Nihana': 'Nihana.jpg',
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
let totalWorksCount = 0;
let activeWorksCount = 0;
let unpaidWorksCount = 0;
let completedWorksCount = 0;
let dueTodayWorksCount = 0;
let works = [];
let isWorksLoaded = false;
let categories = [];
let enquiries = [];
let currentWorkId = null;
let currentCreatorFilter = 'all';
let deleteWorkId = null;
let deleteEnquiryId = null;
let convertingEnquiryId = null;
let statusUpdateInProgress = new Set();
let showUnpaidWorks = false; // UPDATED: New state for unpaid works
let showCompletedWorks = false;
let currentFilters = {
    member: 'all',
    status: 'all',
    deadline: 'all',
    creator: 'all',
    category: 'all'
};
let notificationsEnabled = false;
let currentSearchTerm = '';
let searchDebounceTimer = null;
let deepSearchActive = false;
let editCategorySelectionIndex = -1;

// Image upload variables
let uploadedImages = [];
let editUploadedImages = [];
let currentWorkImages = [];

// == UPDATED: NOTIFICATION SYSTEM ==
function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;

    // Determine icon based on type (Simplified icons for pill style)
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
            break;
        case 'error':
            icon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>';
            break;
        case 'warning':
            icon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>';
            break;
        default: // info
            icon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    notification.innerHTML = `
        <div class="notification-icon-wrapper">
            ${icon}
        </div>
        <div class="notification-message">${message}</div>
        <div class="notification-progress" style="animation-duration: ${duration}ms"></div>
    `;

    // Add click to dismiss (Immediate fade)
    notification.onclick = () => {
        notification.style.transition = 'opacity 0.2s ease';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 200);
    };

    // Add to container
    container.appendChild(notification);

    // Auto remove: Start fading when 25% time remains
    const fadeStart = duration * 0.75;
    const fadeDuration = duration * 0.25;

    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transition = `opacity ${fadeDuration}ms ease-out`;
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), fadeDuration);
        }
    }, fadeStart);
}

// == INITIALIZATION ==
document.addEventListener('DOMContentLoaded', async function () {
    updateDateTime();
    setInterval(updateDateTime, 1000);

    sessionId = generateSessionId();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed'));
    }

    requestNotificationPermission(); // Do not await, let it run in background
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
        
        const userAvatarImg = document.getElementById('userAvatar');
        if (userAvatarImg) {
            userAvatarImg.src = memberAvatars[savedUser];
            userAvatarImg.style.display = '';
            if (userAvatarImg.nextElementSibling) {
                userAvatarImg.nextElementSibling.style.display = 'none';
            }
        }
        const fallbackElem = document.getElementById('userAvatarFallback');
        if (fallbackElem) fallbackElem.textContent = savedUser[0].toUpperCase();

        // Show app UI and active tab immediately so user isn't stuck waiting
        showTab('dashboard');
        renderWorks();
        updateStats();

        // Fetch background data
        refreshCategories();
        refreshWorks();
        refreshEnquiries();

        setupMemberFilters();
        subscribeToWorks();
        subscribeToNotifications();
        subscribeToEnquiries();
    }

    setupDropdownHandlers();
    setupFormHandlers();
    setupStaffSelection();

    // Disable right-click context menu
    document.addEventListener('contextmenu', event => event.preventDefault());
});

// == SESSION MANAGEMENT ==
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// == ENQUIRIES FUNCTIONALITY ==
let currentEnquirySearch = '';
let currentEnquiryStatusFilter = 'all';

async function refreshEnquiries() {
    try {
        const { data, error } = await sb
            .from('enquiries')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        enquiries = data || [];

        renderEnquiries();
    } catch (error) {
        console.error('Error fetching enquiries:', error);
        showNotification('Failed to refresh enquiries', 'error');
    }
}



function handleEnquirySearch(term) {
    currentEnquirySearch = (term || '').trim().toLowerCase();
    renderEnquiries();
}

function filterEnquiriesByStatus(status) {
    currentEnquiryStatusFilter = status;
    
    // Update active tab buttons
    document.querySelectorAll('.enquiry-status-filter').forEach(btn => {
        btn.classList.remove('bg-violet-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-gray-600', 'hover:bg-gray-100');
    });

    const activeTabKey = status === 'In Progress' ? 'InProgress' : status;
    const activeBtn = document.getElementById(`enquiryTab-${activeTabKey}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-600', 'hover:bg-gray-100');
        activeBtn.classList.add('bg-violet-600', 'text-white', 'shadow-sm');
    }

    renderEnquiries();
}

function getFilteredEnquiries() {
    return enquiries.filter(e => {
        // Status filter
        if (currentEnquiryStatusFilter !== 'all') {
            const eStatus = e.status || 'New';
            if (eStatus !== currentEnquiryStatusFilter) return false;
        }

        // Search term filter
        if (currentEnquirySearch) {
            const term = currentEnquirySearch.replace(/\s+/g, '');
            const cName = (e.customer_name || '').toLowerCase();
            const desc = (e.description || '').toLowerCase();
            const rawPhone = (e.whatsapp_number || '').replace(/\s+/g, '').toLowerCase();
            const staff = (e.assigned_staff || '').toLowerCase();

            const matches = cName.includes(currentEnquirySearch) ||
                            desc.includes(currentEnquirySearch) ||
                            staff.includes(currentEnquirySearch) ||
                            rawPhone.includes(term);
            if (!matches) return false;
        }

        return true;
    });
}

function renderEnquiries() {
    const container = document.getElementById('enquiriesContainer');
    if (!container) return;

    container.innerHTML = '';

    const filtered = getFilteredEnquiries();

    if (filtered.length === 0) {
        document.getElementById('noEnquiries')?.classList.remove('hidden');
        return;
    }

    document.getElementById('noEnquiries')?.classList.add('hidden');

    filtered.forEach(enquiry => {
        const enquiryCard = createEnquiryCard(enquiry);
        container.appendChild(enquiryCard);
    });
}

function openWhatsAppChat(phoneNumber, event) {
    if (event) event.stopPropagation();
    if (!phoneNumber) return;
    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNum) return;
    window.open(`https://wa.me/${cleanNum}`, '_blank');
}

function createEnquiryCard(enquiry) {
    const div = document.createElement('div');

    // Status config
    const statusConfig = {
        'New': { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-600', dot: 'bg-blue-500', bar: 'bg-blue-500' },
        'In Progress': { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-600', dot: 'bg-amber-500', bar: 'bg-amber-500' },
        'Converted': { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-600', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
        'Cancelled': { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-600', dot: 'bg-rose-500', bar: 'bg-rose-500' }
    };

    const config = statusConfig[enquiry.status || 'New'] || statusConfig['New'];
    const initial = (enquiry.customer_name || 'C').charAt(0).toUpperCase();

    div.className = 'bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-xl hover:border-violet-100 transition-all duration-300 flex flex-col h-full group relative overflow-hidden';
    div.innerHTML = `
        <div class="absolute top-0 left-0 right-0 h-1.5 ${config.bar}"></div>

        <div class="flex items-start justify-between gap-3 mb-4 pt-1">
            <div class="min-w-0">
                <h3 class="font-bold text-gray-900 text-base leading-tight truncate group-hover:text-violet-600 transition-colors">${enquiry.customer_name}</h3>
                <p class="text-[11px] text-gray-400 font-medium tracking-wide">
                    ${(() => {
                        const created = new Date(enquiry.created_at);
                        if (isNaN(created)) return '';
                        const now = new Date();
                        const isToday = now.toDateString() === created.toDateString();
                        return isToday ? 'Today' : created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    })()}
                </p>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
                <div class="relative group/status">
                    <button onclick="event.stopPropagation(); toggleEnquiryStatusDropdown(${enquiry.id})" class="px-2.5 py-1 ${config.bg} ${config.text} border rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 hover:opacity-90 transition-all shadow-2xs">
                        <span class="w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse"></span>
                        ${enquiry.status || 'New'}
                        <svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <div id="statusDropdown-${enquiry.id}" class="hidden absolute right-0 mt-2 w-36 bg-white rounded-xl shadow-xl border border-gray-100 z-30 py-1.5 overflow-hidden">
                        ${['New', 'In Progress', 'Converted', 'Cancelled'].map(s => `
                            <button onclick="updateEnquiryStatus(${enquiry.id}, '${s}')" class="w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-tight text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full ${statusConfig[s].dot}"></span>
                                ${s}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <button onclick="showEditEnquiryModal(${enquiry.id})" class="text-gray-300 hover:text-violet-600 p-1.5 rounded-lg hover:bg-violet-50 transition-colors" title="Edit Lead">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                </button>

                <button onclick="deleteEnquiry(${enquiry.id})" class="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete Lead">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
        
        <div class="bg-gray-50/80 rounded-xl p-3.5 mb-4 flex-1 border border-gray-100/60">
            <p class="text-xs text-gray-600 leading-relaxed italic line-clamp-3">
                ${enquiry.description ? `"${enquiry.description}"` : '<span class="text-gray-400 not-italic">No requirement specified</span>'}
            </p>
        </div>
        
        <div class="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-gray-100">
            ${enquiry.status !== 'Converted' ? `
                <button onclick="convertEnquiryToWork(${enquiry.id})" class="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-100 active:scale-95">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                    Add to Work
                </button>
            ` : `
                <button class="flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-bold cursor-not-allowed">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg>
                    Converted
                </button>
            `}
            
            ${enquiry.whatsapp_number ? `
                <button onclick="copyToClipboard('${enquiry.whatsapp_number}', this)" class="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all border border-emerald-100">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path></svg>
                    <span>${enquiry.whatsapp_number}</span>
                </button>
            ` : `
                <button class="flex items-center justify-center gap-1.5 py-2.5 bg-gray-50 text-gray-400 rounded-xl text-[10px] font-bold border border-gray-100 cursor-default opacity-60">
                    <svg class="w-3.5 h-3.5 grayscale opacity-50" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path></svg>
                    <span>No Number</span>
                </button>
            `}
        </div>
    `;

    return div;
}

function toggleEnquiryStatusDropdown(enquiryId) {
    const dropdown = document.getElementById(`statusDropdown-${enquiryId}`);
    const isHidden = dropdown.classList.contains('hidden');

    // Close all other status dropdowns first
    document.querySelectorAll('[id^="statusDropdown-"]').forEach(d => d.classList.add('hidden'));

    if (isHidden) {
        dropdown.classList.remove('hidden');
    }
}

async function updateEnquiryStatus(enquiryId, status) {
    try {
        const { error } = await sb
            .from('enquiries')
            .update({ status: status })
            .eq('id', enquiryId);

        if (error) throw error;

        showNotification(`Lead moved to ${status}`, 'success');
        refreshEnquiries();
    } catch (error) {
        console.error('Error updating enquiry status:', error);
        showNotification('Failed to update status', 'error');
    }
}

async function convertEnquiryToWork(enquiryId) {
    const enquiry = enquiries.find(e => e.id === enquiryId);
    if (!enquiry) return;

    convertingEnquiryId = enquiryId;

    // Show Add Work Tab
    showTab('add');

    // Pre-fill fields with clean customer name
    document.getElementById('workName').value = enquiry.customer_name || '';
    document.getElementById('whatsappNumber').value = enquiry.whatsapp_number || '';
    document.getElementById('workDescription').value = enquiry.description || '';

    // Set Assigned Staff if any
    if (enquiry.assigned_staff) {
        if (typeof window.selectStaffOption === 'function') {
            window.selectStaffOption(enquiry.assigned_staff, 'assignStaffContainer', 'assignStaff');
        } else if (typeof selectStaffOption === 'function') {
            selectStaffOption(enquiry.assigned_staff, 'assignStaffContainer', 'assignStaff');
        }
    }

    showNotification('Converted enquiry details. Review and save!', 'info');
}

async function deleteEnquiry(enquiryId) {
    const { data: enquiry, error } = await sb
        .from('enquiries')
        .select('customer_name')
        .eq('id', enquiryId)
        .single();
    
    if (error) {
        console.error('Error fetching enquiry for delete:', error);
        return;
    }

    deleteEnquiryId = enquiryId;
    document.getElementById('enquiryDeleteConfirmText').textContent = 
        `Are you sure you want to delete the enquiry from "${enquiry.customer_name}"? This action cannot be undone.`;
    
    const confirmBtn = document.getElementById('confirmEnquiryDeleteBtn');
    confirmBtn.onclick = () => executeDeleteEnquiry(enquiryId);
    
    document.getElementById('enquiryDeleteConfirmModal').classList.remove('hidden');
}

function closeEnquiryDeleteModal() {
    document.getElementById('enquiryDeleteConfirmModal').classList.add('hidden');
    deleteEnquiryId = null;
}

async function executeDeleteEnquiry(enquiryId) {
    try {
        const { error } = await sb
            .from('enquiries')
            .delete()
            .eq('id', enquiryId);

        if (error) throw error;

        showNotification('Lead deleted successfully', 'success');
        refreshEnquiries();
        closeEnquiryDeleteModal();
    } catch (error) {
        console.error('Error deleting lead:', error);
        showNotification('Failed to delete lead', 'error');
    }
}

function showEditEnquiryModal(enquiryId) {
    const enquiry = enquiries.find(e => e.id === enquiryId);
    if (!enquiry) return;

    document.getElementById('editEnquiryId').value = enquiry.id;
    document.getElementById('editEnquiryCustomerName').value = enquiry.customer_name || '';
    document.getElementById('editEnquiryWhatsapp').value = enquiry.whatsapp_number || '';
    document.getElementById('editEnquiryDescription').value = enquiry.description || '';

    document.getElementById('editEnquiryModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('editEnquiryCustomerName').focus();
    }, 100);
}

function closeEditEnquiryModal() {
    document.getElementById('editEnquiryModal').classList.add('hidden');
    document.getElementById('editEnquiryForm').reset();
}

async function handleEditEnquirySubmit(event) {
    event.preventDefault();
    const id = document.getElementById('editEnquiryId').value;
    const customerName = document.getElementById('editEnquiryCustomerName')?.value.trim();
    const whatsapp = document.getElementById('editEnquiryWhatsapp')?.value.trim() || '';
    const description = document.getElementById('editEnquiryDescription')?.value.trim();

    if (!id || !customerName || !description) {
        showNotification('Please fill in Customer Name and Description', 'warning');
        return;
    }

    try {
        const { error } = await sb
            .from('enquiries')
            .update({
                customer_name: customerName,
                whatsapp_number: whatsapp,
                description: description
            })
            .eq('id', id);

        if (error) throw error;

        closeEditEnquiryModal();
        showNotification('Enquiry updated successfully!', 'success');
        refreshEnquiries();
    } catch (error) {
        console.error('Error updating enquiry:', error);
        showNotification('Failed to update enquiry', 'error');
    }
}

function showAddEnquiryModal() {
    resetEnquiryForm();
    document.getElementById('addEnquiryModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('enquiryCustomerName').focus();
    }, 100);
}

function closeAddEnquiryModal() {
    document.getElementById('addEnquiryModal').classList.add('hidden');
    resetEnquiryForm();
}

function resetEnquiryForm() {
    const form = document.getElementById('addEnquiryForm');
    if (form) form.reset();
}

async function handleEnquirySubmit(event) {
    event.preventDefault();
    const customerName = document.getElementById('enquiryCustomerName')?.value.trim();
    const whatsapp = document.getElementById('enquiryWhatsapp')?.value.trim() || '';
    const description = document.getElementById('enquiryDescription')?.value.trim();

    if (!customerName || !description) {
        showNotification('Please fill in Customer Name and Description', 'warning');
        return;
    }

    try {
        const { error } = await sb
            .from('enquiries')
            .insert([{
                customer_name: customerName,
                whatsapp_number: whatsapp,
                description: description,
                created_by: currentUser
            }]);

        if (error) throw error;

        closeAddEnquiryModal();
        showNotification('New enquiry added!', 'success');
        refreshEnquiries();
    } catch (error) {
        console.error('Error adding enquiry:', error);
        showNotification('Failed to add enquiry: ' + (error.message || error), 'error');
    }
}

// == UPDATED: REAL-TIME SEARCH FUNCTIONALITY WITH DEBOUNCE ==
function handleRealtimeSearch(searchTerm) {
    const clearBtn = document.getElementById('searchClearBtn');
    const searchInput = document.getElementById('workSearchInput');
    const searchIcon = document.getElementById('workSearchIcon');

    // Retain active input styling whenever text exists in the search bar
    if (searchInput) {
        if (searchTerm.trim()) {
            searchInput.classList.add('bg-white', 'border-indigo-500', 'ring-4', 'ring-indigo-500/10');
            searchInput.classList.remove('bg-gray-100', 'border-gray-200');
            if (searchIcon) searchIcon.classList.add('text-indigo-600');
        } else {
            searchInput.classList.remove('bg-white', 'border-indigo-500', 'ring-4', 'ring-indigo-500/10');
            searchInput.classList.add('bg-gray-100', 'border-gray-200');
            if (searchIcon) searchIcon.classList.remove('text-indigo-600');
        }
    }

    // Immediate UI feedback for clear button
    if (clearBtn) {
        if (searchTerm.trim()) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    // Debounce the actual search and render
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        currentSearchTerm = searchTerm.toLowerCase().trim();
        renderWorks();
        updateMemberTiles();
    }, 250);
}

function toggleDeepSearch() {
    deepSearchActive = !deepSearchActive;

    // Clear staff filter to ensure true global search
    if (deepSearchActive) {
        currentFilters.member = 'all';
        // Update UI tiles
        document.querySelectorAll('.member-tile').forEach(tile => {
            tile.classList.remove('active');
            if (tile.textContent.includes('All')) {
                tile.classList.add('active');
            }
        });
    }

    renderWorks();
}

function clearSearch() {
    const searchInput = document.getElementById('workSearchInput');
    const searchIcon = document.getElementById('workSearchIcon');
    const clearBtn = document.getElementById('searchClearBtn');

    if (searchInput) {
        searchInput.value = '';
        searchInput.classList.remove('bg-white', 'border-indigo-500', 'ring-4', 'ring-indigo-500/10');
        searchInput.classList.add('bg-gray-100', 'border-gray-200');
    }
    if (searchIcon) {
        searchIcon.classList.remove('text-indigo-600');
    }

    currentSearchTerm = '';

    if (clearBtn) {
        clearBtn.classList.add('hidden');
    }

    renderWorks();
    updateMemberTiles();
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
            showNotification('File too large. Maximum size is 10MB', 'error');
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
            showNotification('Failed to upload image: ' + file.name, 'error');
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

    showNotification(`${processedFiles} image(s) uploaded successfully`, 'success');
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

// Track where mousedown started to prevent drag-selection from closing modals
let modalMousedownTarget = null;
document.addEventListener('mousedown', (e) => {
    modalMousedownTarget = e.target;
});

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function downloadImage() {
    const img = document.getElementById('imageViewerImg');
    if (!img || !img.src) return;

    try {
        // Fetch the image as a blob
        const response = await fetch(img.src);
        const blob = await response.blob();

        // Create a download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Extract filename from URL or use timestamp
        const urlParts = img.src.split('/');
        const filename = urlParts[urlParts.length - 1] || `image_${Date.now()}.jpg`;
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showNotification('Image downloaded successfully', 'success');
    } catch (error) {
        console.error('Download failed:', error);
        showNotification('Failed to download image', 'error');
    }
}

async function copyImage() {
    const img = document.getElementById('imageViewerImg');
    if (!img || !img.src) return;

    try {
        // Try to fetch the image as a blob
        const response = await fetch(img.src);
        const blob = await response.blob();

        // Copy to clipboard using the Clipboard API
        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob
            })
        ]);

        showNotification('Image copied to clipboard', 'success');
    } catch (error) {
        console.error('Copy failed:', error);

        // Fallback: Use canvas to copy the image
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Create a new image to avoid CORS issues
            const image = new Image();
            image.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = img.src;
            });

            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            ctx.drawImage(image, 0, 0);

            // Convert canvas to blob
            const canvasBlob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });

            // Copy the blob to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': canvasBlob
                })
            ]);

            showNotification('Image copied to clipboard', 'success');
        } catch (canvasError) {
            console.error('Canvas copy failed:', canvasError);
            showNotification('Failed to copy image. Try downloading instead.', 'error');
        }
    }
}

// == KEYBOARD EVENT LISTENERS ==
function setupKeyboardEventListeners() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            // Check image viewer first (highest priority)
            if (!document.getElementById('imageViewerModal').classList.contains('hidden')) {
                closeImageViewer();
            } else if (!document.getElementById('workDetailsModal').classList.contains('hidden')) {
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
            } else if (!document.getElementById('enquiryDeleteConfirmModal').classList.contains('hidden')) {
                closeEnquiryDeleteModal();
            } else {
                closeAllDropdowns();
                // Also close edit category dropdown explicitly if it exists
                const editDropdown = document.getElementById('editCategorySearchDropdown');
                if (editDropdown && !editDropdown.classList.contains('hidden')) {
                    editDropdown.classList.add('hidden');
                }
                closeProfileDropdown({ target: document.body });
            }
        }
    });

    // Close Edit Category Dropdown when clicking outside
    document.addEventListener('click', function (e) {
        const editDropdown = document.getElementById('editCategorySearchDropdown');
        const editInput = document.getElementById('editCategorySearch');
        const editIcon = document.getElementById('editCategoryIcon');

        if (editDropdown && !editDropdown.classList.contains('hidden')) {
            if (!editDropdown.contains(e.target) &&
                e.target !== editInput &&
                (!editIcon || !editIcon.contains(e.target))) {
                editDropdown.classList.add('hidden');
            }
        }
    });
}

// == MODAL CLOSE HANDLERS ==
function unlockBodyScroll() {
    document.body.classList.remove('overflow-hidden');
    document.body.style.top = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
}

function closeWorkDetailsModal(event) {
    if (event && event.type === 'click' && modalMousedownTarget !== event.currentTarget) return;
    if (event && event.target !== event.currentTarget) return;

    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    const modal = document.getElementById('workDetailsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    unlockBodyScroll();
}

function closeDetailsModal(event) {
    closeWorkDetailsModal(event);
}

function closeEditModal(event) {
    if (event && event.type === 'click' && modalMousedownTarget !== event.currentTarget) return;
    if (event && event.target !== event.currentTarget) return;

    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    const modal = document.getElementById('editWorkModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    editingWorkId = null;
    editUploadedImages = [];
    currentWorkImages = [];
    unlockBodyScroll();
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
    closeLogoutConfirmModal();
    executeLogout();
}

// == CATEGORIES MANAGEMENT ==
let categorySelectionIndex = -1;

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
        showNotification('Failed to refresh categories', 'error');
    }
}

function populateCategoryDropdowns() {
    categorySelectionIndex = -1;
    const categoryOptions = document.getElementById('categoryOptions');
    if (categoryOptions) {
        categoryOptions.innerHTML = '';
        categories.forEach((category, index) => {
            const div = document.createElement('div');
            div.className = 'dropdown-item uppercase text-sm font-medium category-option';
            div.setAttribute('data-index', index);
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

    const editCategoryDropdown = document.getElementById('editCategoryOptions');
    if (editCategoryDropdown) {
        editCategoryDropdown.innerHTML = '';
        categories.forEach((category, index) => {
            const div = document.createElement('div');
            div.className = 'dropdown-item uppercase text-sm font-medium edit-category-option';
            div.setAttribute('data-index', index);
            div.onclick = () => selectEditCategory(category.name);
            div.innerHTML = `
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                </svg>
                ${category.name}
            `;
            editCategoryDropdown.appendChild(div);
        });
    }

    const categoryFilterItems = document.getElementById('categoryFilterItems');
    if (categoryFilterItems) {
        categoryFilterItems.innerHTML = '';
        categories.forEach(category => {
            const div = document.createElement('div');
            div.className = 'dropdown-item uppercase text-sm font-medium';
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
    categorySelectionIndex = -1;
    const categoryOptions = document.getElementById('categoryOptions');
    if (!categoryOptions) return;

    const filteredCategories = categories.filter(category =>
        category.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    categoryOptions.innerHTML = '';
    filteredCategories.forEach((category, index) => {
        const div = document.createElement('div');
        div.className = 'dropdown-item uppercase text-sm font-medium category-option';
        div.setAttribute('data-index', index);
        div.onclick = () => selectCategory(category.name);
        div.innerHTML = `
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                </svg>
            ${category.name}
        `;
        categoryOptions.appendChild(div);
    });

    // Auto-select first item if searching
    if (filteredCategories.length > 0 && searchTerm) {
        categorySelectionIndex = 0;
        const options = categoryOptions.querySelectorAll('.category-option');
        updateCategorySelection(options);
    }
}

function handleCategoryKeydown(e) {
    const options = document.querySelectorAll('#categoryOptions .category-option');
    if (options.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        categorySelectionIndex++;
        if (categorySelectionIndex >= options.length) categorySelectionIndex = 0;
        updateCategorySelection(options);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        categorySelectionIndex--;
        if (categorySelectionIndex < 0) categorySelectionIndex = options.length - 1;
        updateCategorySelection(options);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (categorySelectionIndex >= 0 && categorySelectionIndex < options.length) {
            options[categorySelectionIndex].click();
        } else if (options.length > 0) {
            // If nothing selected but entries exist, select the first one
            options[0].click();
        }
    }
}

function updateCategorySelection(options) {
    options.forEach((option, index) => {
        if (index === categorySelectionIndex) {
            option.classList.remove('bg-white', 'text-gray-700');
            option.classList.add('bg-blue-100', 'text-blue-800', 'font-semibold');
            option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            option.classList.add('bg-white', 'text-gray-700');
            option.classList.remove('bg-blue-100', 'text-blue-800', 'font-semibold');
        }
    });
}

function selectCategory(categoryName) {
    document.getElementById('workCategory').value = categoryName;
    const input = document.getElementById('categoryInput');
    if (input) input.value = categoryName;
    const text = document.getElementById('categoryText');
    if (text) text.textContent = categoryName;
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

function toggleEditCategorySearchDropdown(forceOpen) {
    const dropdown = document.getElementById('editCategorySearchDropdown');
    const icon = document.getElementById('editCategoryIcon');

    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');

    if (typeof closeAllDropdowns === 'function') {
        closeAllDropdowns();
    }

    if (forceOpen || isHidden) {
        dropdown.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
        const searchInput = document.getElementById('editCategoryInput');
        if (searchInput) {
            filterEditCategories(searchInput.value || '');
        }
    } else {
        dropdown.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

function filterEditCategories(searchTerm) {
    editCategorySelectionIndex = -1;
    const categoryOptions = document.getElementById('editCategoryOptions');
    if (!categoryOptions) return;

    const filteredCategories = categories.filter(category =>
        category.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    categoryOptions.innerHTML = '';
    filteredCategories.forEach((category, index) => {
        const div = document.createElement('div');
        div.className = 'dropdown-item uppercase text-sm font-medium edit-category-option';
        div.setAttribute('data-index', index);
        div.onclick = () => selectEditCategory(category.name);
        div.innerHTML = `
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
            </svg>
            ${category.name}
        `;
        categoryOptions.appendChild(div);
    });

    // Auto-select first item if searching
    if (filteredCategories.length > 0 && searchTerm) {
        editCategorySelectionIndex = 0;
        const options = categoryOptions.querySelectorAll('.edit-category-option');
        updateEditCategorySelection(options);
    }
}

function handleEditCategoryKeydown(e) {
    const options = document.querySelectorAll('#editCategoryOptions .edit-category-option');
    if (options.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        editCategorySelectionIndex++;
        if (editCategorySelectionIndex >= options.length) editCategorySelectionIndex = 0;
        updateEditCategorySelection(options);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        editCategorySelectionIndex--;
        if (editCategorySelectionIndex < 0) editCategorySelectionIndex = options.length - 1;
        updateEditCategorySelection(options);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (editCategorySelectionIndex >= 0 && editCategorySelectionIndex < options.length) {
            options[editCategorySelectionIndex].click();
        } else if (options.length > 0) {
            options[0].click();
        }
    }
}

function updateEditCategorySelection(options) {
    options.forEach((option, index) => {
        if (index === editCategorySelectionIndex) {
            option.classList.remove('bg-white', 'text-gray-700');
            option.classList.add('bg-blue-100', 'text-blue-800', 'font-semibold');
            option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            option.classList.add('bg-white', 'text-gray-700');
            option.classList.remove('bg-blue-100', 'text-blue-800', 'font-semibold');
        }
    });
}

function selectEditCategory(categoryName) {
    document.getElementById('editWorkCategory').value = categoryName;
    const input = document.getElementById('editCategoryInput');
    if (input) input.value = categoryName;
    const text = document.getElementById('editCategoryText');
    if (text) text.textContent = categoryName;

    // Explicitly close the edit dropdown
    const dropdown = document.getElementById('editCategorySearchDropdown');
    const icon = document.getElementById('editCategoryIcon');
    if (dropdown) dropdown.classList.add('hidden');
    if (icon) icon.style.transform = 'rotate(0deg)';

    closeAllDropdowns();
    filterEditCategories('');
}

function handleEditModalClick(event) {
    event.stopPropagation(); // Keep modal open

    // Logic to close dropdown if clicked outside
    const editDropdown = document.getElementById('editCategorySearchDropdown');
    const editInput = document.getElementById('editCategorySearch');
    const editIcon = document.getElementById('editCategoryIcon');
    const editBtn = document.getElementById('editCategoryButton');

    if (editDropdown && !editDropdown.classList.contains('hidden')) {
        // If click is NOT inside dropdown/button/input, close it.
        // We use .contains to check if clicked element is inside specific containers.
        if (!editDropdown.contains(event.target) &&
            event.target !== editInput &&
            !editBtn.contains(event.target)) {

            editDropdown.classList.add('hidden');
            if (editIcon) editIcon.style.transform = 'rotate(0deg)';
        }
    }
}


// == FORM HANDLERS ==
function setupFormHandlers() {
    const workForm = document.getElementById('workForm');
    if (workForm) {
        workForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const submitBtn = workForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            const assignedStaff = document.getElementById('assignStaff').value;
            const categoryInputVal = (document.getElementById('categoryInput')?.value || '').trim();
            const workCategoryVal = (document.getElementById('workCategory')?.value || '').trim();
            const rawCategory = categoryInputVal || workCategoryVal;

            if (!assignedStaff) {
                showNotification('Please select a staff member', 'error');
                return;
            }

            if (!rawCategory) {
                showNotification('Please select a category', 'error');
                return;
            }

            // Require category to exist in database (+ Add Category button must be used to create new categories)
            const matchedCategory = categories.find(cat => (cat.name || '').toLowerCase() === rawCategory.toLowerCase());
            if (!matchedCategory) {
                showNotification('Category not found! Click "+ Add Category"', 'error');
                return;
            }

            const category = matchedCategory.name;

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

                // Delete converted enquiry from enquiries table upon successful work creation
                if (convertingEnquiryId) {
                    try {
                        await sb.from('enquiries').delete().eq('id', convertingEnquiryId);
                        convertingEnquiryId = null;
                        await refreshEnquiries();
                    } catch (eErr) {
                        console.error('Error removing converted enquiry:', eErr);
                    }
                }

                resetForm();
                uploadedImages = [];
                updateImagePreview();
                await refreshWorks();
                showTab('works');
                showNotification('Work added successfully!', 'success');

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
                showNotification('Failed to add work', 'error');
            } finally {
                // Restore button state
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const categoryName = document.getElementById('newCategoryName').value.trim();

            if (!categoryName) {
                showNotification('Please enter a category name', 'error');
                return;
            }

            const existingCategory = categories.find(cat =>
                cat.name.toLowerCase() === categoryName.toLowerCase()
            );

            if (existingCategory) {
                showNotification('Category already exists', 'error');
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
                showNotification('Category added successfully!', 'success');

            } catch (error) {
                console.error('Error adding category:', error);
                showNotification('Failed to add category', 'error');
            }
        });
    }



    const editWorkForm = document.getElementById('editWorkForm');
    if (editWorkForm) {
        editWorkForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            if (!editingWorkId) return;

            const editCategoryInputVal = (document.getElementById('editCategoryInput')?.value || '').trim();
            const editWorkCategoryVal = (document.getElementById('editWorkCategory')?.value || '').trim();
            const rawCategory = editCategoryInputVal || editWorkCategoryVal;

            if (!rawCategory) {
                showNotification('Please select a category', 'error');
                return;
            }

            const matchedCategory = categories.find(cat => (cat.name || '').toLowerCase() === rawCategory.toLowerCase());
            if (!matchedCategory) {
                showNotification('Category not found! Click "+ Add Category"', 'error');
                return;
            }

            const category = matchedCategory.name;

            const allImages = [...(currentWorkImages || []), ...editUploadedImages.map(img => img.url)];

            const updatedWork = {
                work_name: document.getElementById('editWorkName').value,
                category: category,
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
                unlockBodyScroll();

                await refreshWorks();
                showNotification('Work updated successfully!', 'success');

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

    document.querySelectorAll('[id^="statusDropdown-"]').forEach(dropdown => {
        dropdown.classList.add('hidden');
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

function toggleCategorySearchDropdown(forceOpen) {
    const dropdown = document.getElementById('categorySearchDropdown');
    const icon = document.getElementById('categoryIcon');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');

    if (typeof closeAllDropdowns === 'function') {
        closeAllDropdowns();
    }

    if (forceOpen || isHidden) {
        dropdown.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
        const searchInput = document.getElementById('categoryInput');
        if (searchInput) {
            filterCategories(searchInput.value || '');
        }
    } else {
        dropdown.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

// == FILTER SELECTION FUNCTIONS ==
function selectStatusFilter(value) {
    currentFilters.status = value;
    document.getElementById('statusFilterText').textContent = value === 'all' ? 'All Status' : value;

    // Toggle historical view modes if specifically selected from dropdown
    if (value === 'Completed') {
        showCompletedWorks = true;
        showUnpaidWorks = false;
    } else if (value === 'Unpaid') {
        showUnpaidWorks = true;
        showCompletedWorks = false;
    } else if (value !== 'all') {
        // If selecting a specific active status, ensure we aren't in history mode
        showCompletedWorks = false;
        showUnpaidWorks = false;
    }

    closeAllDropdowns();
    renderWorks();
    updateMemberTiles();
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
    deepSearchActive = false; // Reset deep search when clearing all filters
    currentFilters = {
        member: 'all',
        status: 'all',
        deadline: 'all',
        creator: 'all',
        category: 'all'
    };

    // Preserve currentSearchTerm and search input value
    // currentSearchTerm = '';
    // document.getElementById('workSearchInput').value = '';

    document.getElementById('statusFilterText').textContent = 'All Status';
    document.getElementById('categoryFilterText').textContent = 'All Categories';
    document.getElementById('creatorFilterText').textContent = 'All Creators';

    selectMemberTile('all');

    closeAllDropdowns();
    renderWorks();
    updateMemberTiles();
    updateStats();
    showNotification('All filters cleared', 'info');
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
    let baseWorks = works;

    if (currentWorkViewMode === 'active') {
        baseWorks = works.filter(w => w.status !== 'Completed' && w.status !== 'Unpaid');
    } else if (currentWorkViewMode === 'unpaid') {
        baseWorks = works.filter(w => w.status === 'Unpaid');
    } else if (currentWorkViewMode === 'completed') {
        baseWorks = works.filter(w => w.status === 'Completed');
    } else if (currentWorkViewMode === 'all') {
        baseWorks = works;
    }

    let contextWorks = baseWorks;

    // Apply Search to contextWorks
    if (currentSearchTerm) {
        const termNoSpace = currentSearchTerm.replace(/\s+/g, '');
        contextWorks = baseWorks.filter(work => {
            const workName = (work.work_name || '').toLowerCase();
            const description = (work.description || '').toLowerCase();
            const whatsappNumber = (work.whatsapp_number || '').replace(/\s+/g, '').toLowerCase();
            const category = (work.category || '').toLowerCase();

            return workName.includes(currentSearchTerm) ||
                description.includes(currentSearchTerm) ||
                whatsappNumber.includes(termNoSpace) ||
                category.includes(currentSearchTerm);
        });
    }

    // Apply Category & Creator filters
    if (currentFilters.category !== 'all') {
        contextWorks = contextWorks.filter(w => w.category === currentFilters.category);
    }
    if (currentFilters.creator !== 'all') {
        contextWorks = contextWorks.filter(w => w.created_by === currentFilters.creator);
    }

    // Calculate final counts for each staff member tile
    const counts = {
        all: contextWorks.length,
        Irshad: contextWorks.filter(w => w.assigned_staff === 'Irshad').length,
        Niyas: contextWorks.filter(w => w.assigned_staff === 'Niyas').length,
        Muhammed: contextWorks.filter(w => w.assigned_staff === 'Muhammed').length,
        Nihana: contextWorks.filter(w => w.assigned_staff === 'Nihana').length,
        Safvan: contextWorks.filter(w => w.assigned_staff === 'Safvan').length,
        Najil: contextWorks.filter(w => w.assigned_staff === 'Najil').length
    };

    const countElements = [
        { id: 'allCount', count: counts.all },
        { id: 'irshadCount', count: counts.Irshad },
        { id: 'niyasCount', count: counts.Niyas },
        { id: 'muhammedCount', count: counts.Muhammed },
        { id: 'nihanaCount', count: counts.Nihana },
        { id: 'safvanCount', count: counts.Safvan },
        { id: 'najilCount', count: counts.Najil }
    ];

    countElements.forEach(({ id, count }) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = `${count} works`;
        }
    });
}

// == UPDATED: DASHBOARD NAVIGATION WITH UNPAID SUPPORT ==
// == SEGMENTED WORK VIEW TABS CONTROL ==
let currentWorkViewMode = 'active';

function setWorkViewMode(mode) {
    currentWorkViewMode = mode;

    if (mode === 'all') {
        showCompletedWorks = true;
        showUnpaidWorks = true;
        currentFilters.status = 'all';
    } else if (mode === 'active') {
        showCompletedWorks = false;
        showUnpaidWorks = false;
        currentFilters.status = 'all';
    } else if (mode === 'unpaid') {
        showUnpaidWorks = true;
        showCompletedWorks = false;
        currentFilters.status = 'Unpaid';
    } else if (mode === 'completed') {
        showCompletedWorks = true;
        showUnpaidWorks = false;
        currentFilters.status = 'Completed';
    }

    updateWorkViewTabsUI();
    renderWorks();
    updateMemberTiles();
}

function updateWorkViewTabsUI() {
    const allBtn = document.getElementById('viewAllBtn');
    const activeBtn = document.getElementById('viewActiveBtn');
    const unpaidBtn = document.getElementById('viewUnpaidBtn');
    const completedBtn = document.getElementById('viewCompletedBtn');

    if (!activeBtn || !unpaidBtn || !completedBtn) return;

    const allButtons = [allBtn, activeBtn, unpaidBtn, completedBtn].filter(Boolean);

    allButtons.forEach(btn => {
        btn.classList.remove('active', 'bg-white', 'text-gray-900', 'shadow-2xs');
        btn.classList.add('text-gray-600');
    });

    if (currentWorkViewMode === 'all' && allBtn) {
        allBtn.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-2xs');
        allBtn.classList.remove('text-gray-600');
    } else if (currentWorkViewMode === 'active' && activeBtn) {
        activeBtn.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-2xs');
        activeBtn.classList.remove('text-gray-600');
    } else if (currentWorkViewMode === 'unpaid' && unpaidBtn) {
        unpaidBtn.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-2xs');
        unpaidBtn.classList.remove('text-gray-600');
    } else if (currentWorkViewMode === 'completed' && completedBtn) {
        completedBtn.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-2xs');
        completedBtn.classList.remove('text-gray-600');
    }

    const allCount = works.length;
    const activeCount = works.filter(w => w.status !== 'Completed' && w.status !== 'Unpaid').length;
    const unpaidCount = works.filter(w => w.status === 'Unpaid').length;
    const completedCount = works.filter(w => w.status === 'Completed').length;

    const allBadge = document.getElementById('allBadgeCount');
    const activeBadge = document.getElementById('activeBadgeCount');
    const unpaidBadge = document.getElementById('unpaidBadgeCount');
    const completedBadge = document.getElementById('completedBadgeCount');

    if (allBadge) allBadge.textContent = isWorksLoaded ? allCount : '...';
    if (activeBadge) activeBadge.textContent = isWorksLoaded ? activeCount : '...';
    if (unpaidBadge) unpaidBadge.textContent = isWorksLoaded ? unpaidCount : '...';
    if (completedBadge) completedBadge.textContent = isWorksLoaded ? completedCount : '...';
}

function goToWorksWithFilter(filterType) {
    showTab('works');

    if (filterType === 'Completed') {
        setWorkViewMode('completed');
    } else if (filterType === 'Unpaid') {
        setWorkViewMode('unpaid');
    } else if (filterType === 'today') {
        setWorkViewMode('active');
        currentFilters.deadline = 'today';
        renderWorks();
    } else {
        setWorkViewMode('active');
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
        const swOptions = {
            icon: options.icon || 'logo.png',
            body: options.body || '',
            image: options.image,
            badge: 'logo.png',
            tag: options.tag || 'work-update',
            requireInteraction: false,
            vibrate: [100, 50, 100],
            data: {
                url: './'
            },
            ...options
        };

        // Use Service Worker if available (much more stable in background/minimized states)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, swOptions);
            });
        } else {
            // Fallback to standard client-side Notification
            new Notification(title, swOptions);
        }
    }
}

function toggleNotifications() {
    if (!notificationsEnabled) {
        requestNotificationPermission().then(() => {
            if (notificationsEnabled) {
                showNotification('Browser notifications enabled successfully!', 'success');
            } else {
                showNotification('Notification permission denied', 'error');
            }
        });
    } else {
        showNotification('Notifications are already enabled!', 'info');
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
        showNotification('WhatsApp number copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy to clipboard', 'error');
    });
}


// == USER AUTHENTICATION ==
function loginUser(name, role) {
    try {
        currentUser = name;
        currentUserRole = role;

        localStorage.setItem('currentUser', name);
        localStorage.setItem('currentUserRole', role);

        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.classList.add('hidden');

        const mainApp = document.getElementById('mainApp');
        if (mainApp) mainApp.classList.remove('hidden');

        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = name;

        const profileUserNameEl = document.getElementById('profileUserName');
        if (profileUserNameEl) profileUserNameEl.textContent = name;
        
        const userAvatarImg = document.getElementById('userAvatar');
        if (userAvatarImg) {
            userAvatarImg.src = memberAvatars[name] || 'default-avatar.jpg';
            userAvatarImg.style.display = '';
            if (userAvatarImg.nextElementSibling) {
                userAvatarImg.nextElementSibling.style.display = 'none';
            }
        }
        const fallbackElem = document.getElementById('userAvatarFallback');
        if (fallbackElem) fallbackElem.textContent = name ? name[0].toUpperCase() : 'U';

        // Sequential load — avoids network race on login
        if (typeof refreshCategories === 'function') refreshCategories();
        if (typeof refreshWorks === 'function') refreshWorks();
        if (typeof refreshEnquiries === 'function') refreshEnquiries();

        if (typeof setupMemberFilters === 'function') setupMemberFilters();
        if (typeof subscribeToWorks === 'function') subscribeToWorks();
        if (typeof subscribeToNotifications === 'function') subscribeToNotifications();
        if (typeof subscribeToEnquiries === 'function') subscribeToEnquiries();

        if (typeof renderWorks === 'function') renderWorks();
        if (typeof updateStats === 'function') updateStats();
        if (typeof updateMemberTiles === 'function') updateMemberTiles();
        if (typeof showTab === 'function') showTab('dashboard');

        if (typeof showNotification === 'function') showNotification(`Welcome back, ${name}!`, 'success');
    } catch (err) {
        console.error('Error during login:', err);
    }
}

function executeLogout() {
    closeLogoutConfirmModal();

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

    showNotification('Logged out successfully', 'info');
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
                console.log('Works table changed:', payload);
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

function subscribeToEnquiries() {
    sb
        .channel('enquiries-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'enquiries' },
            async (payload) => {
                console.log('🔄 Enquiries table changed:', payload);
                setTimeout(async () => {
                    await refreshEnquiries();
                }, 500);
            }
        )
        .subscribe();
}

// == WORKS MANAGEMENT ==
async function refreshWorks(retries = 3) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // Fetch ALL works from Supabase using pagination to bypass the 1000-row return limit
        let allWorks = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await sb
                .from('works')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + limit - 1);

            if (error) throw error;

            allWorks = allWorks.concat(data || []);
            if (!data || data.length < limit) {
                hasMore = false;
            } else {
                from += limit;
            }
        }

        works = allWorks;
        totalWorksCount = works.length;
        activeWorksCount = works.filter(w => ['Pending', 'In Progress', 'Proof'].includes(w.status)).length;
        unpaidWorksCount = works.filter(w => w.status === 'Unpaid').length;
        completedWorksCount = works.filter(w => w.status === 'Completed').length;
        dueTodayWorksCount = works.filter(w => w.deadline === todayStr && w.status !== 'Completed').length;
        isWorksLoaded = true;

        renderWorks();
        updateStats();
        updateMemberTiles();
        updateRecentActivity();
    } catch (error) {
        console.error('Error fetching works:', error);
        if (retries > 1) {
            // Retry silently after short delay — don't bother user
            await new Promise(r => setTimeout(r, 1500));
            return refreshWorks(retries - 1);
        }
        showNotification('Failed to load works. Please check connection.', 'error');
    }
}

// == UPDATED: FILTER WORKS WITH PERFORMANCE OPTIMIZATION ==
let foundHiddenMatchesCount = 0;

function filterWorks() {
    let filteredWorks = [...works];

    // Handle view mode filter first
    if (currentWorkViewMode === 'active') {
        filteredWorks = filteredWorks.filter(work => work.status !== 'Completed' && work.status !== 'Unpaid');
    } else if (currentWorkViewMode === 'unpaid') {
        filteredWorks = filteredWorks.filter(work => work.status === 'Unpaid');
    } else if (currentWorkViewMode === 'completed') {
        filteredWorks = filteredWorks.filter(work => work.status === 'Completed');
    } else if (currentWorkViewMode === 'all') {
        // Show all works across all statuses
    }

    // Apply search filter
    if (currentSearchTerm) {
        const termNoSpace = currentSearchTerm.replace(/\s+/g, '');

        filteredWorks = filteredWorks.filter(work => {
            const workName = (work.work_name || '').toLowerCase();
            const description = (work.description || '').toLowerCase();
            const whatsappNumber = (work.whatsapp_number || '').replace(/\s+/g, '').toLowerCase();
            const category = (work.category || '').toLowerCase();

            return workName.includes(currentSearchTerm) ||
                description.includes(currentSearchTerm) ||
                whatsappNumber.includes(termNoSpace) ||
                category.includes(currentSearchTerm);
        });
    }

    // Member filter (staff tiles)
    if (currentFilters.member !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.assigned_staff === currentFilters.member);
    }
    if (currentFilters.category !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.category === currentFilters.category);
    }
    if (currentFilters.creator !== 'all') {
        filteredWorks = filteredWorks.filter(work => work.created_by === currentFilters.creator);
    }

    if (currentFilters.deadline !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        filteredWorks = filteredWorks.filter(work => {
            if (!work.deadline) return false;

            const workDeadline = new Date(work.deadline);
            workDeadline.setHours(0, 0, 0, 0);

            if (currentFilters.deadline === 'today') {
                return workDeadline.getTime() === today.getTime();
            } else if (currentFilters.deadline === 'overdue') {
                return workDeadline.getTime() < today.getTime();
            } else if (currentFilters.deadline === 'upcoming') {
                return workDeadline.getTime() > today.getTime();
            }
            return true;
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

let currentRenderLimit = 50;

window.loadMoreWorks = function() {
    currentRenderLimit += 50;
    renderWorks(false);
};

function renderWorks(resetLimit = true) {
    if (resetLimit) {
        currentRenderLimit = 50;
    }

    const container = document.getElementById('worksCardsContainer');
    const noWorks = document.getElementById('noWorks');

    if (!container) return;

    // == FLIP ANIMATION: FIRST (Capture Positions) ==
    const oldPositions = new Map();
    container.querySelectorAll('.work-card').forEach(card => {
        const id = card.getAttribute('data-work-id');
        if (id) {
            oldPositions.set(id, card.getBoundingClientRect());
        }
    });

    const filteredWorks = filterWorks();

    // Clean up deep search toggle if it exists
    const existingToggle = document.getElementById('deepSearchToggle');
    if (existingToggle) existingToggle.remove();

    if (!isWorksLoaded) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
                <svg class="w-10 h-10 animate-spin text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p class="font-medium animate-pulse">Loading workspace...</p>
            </div>
        `;
        if (noWorks) noWorks.classList.add('hidden');
        return;
    }

    if (filteredWorks.length === 0 && foundHiddenMatchesCount === 0) {
        container.innerHTML = '';
        if (noWorks) noWorks.classList.remove('hidden');
        return;
    }

    if (noWorks) noWorks.classList.add('hidden');

    // Slice for performance
    const worksToRender = filteredWorks.slice(0, currentRenderLimit);

    // == UPDATE DOM ==
    container.innerHTML = worksToRender.map(work => createWorkCard(work)).join('');

    // Ensure staff counts are updated based on the current view mode
    updateMemberTiles();

    // Add Load More Button
    if (filteredWorks.length > currentRenderLimit) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.className = 'col-span-full flex justify-center mt-6 mb-8';
        loadMoreDiv.innerHTML = `
            <button onclick="loadMoreWorks()" class="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-bold shadow-sm flex items-center gap-2 cursor-pointer active:scale-95">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                Load More (${filteredWorks.length - currentRenderLimit} remaining)
            </button>
        `;
        container.appendChild(loadMoreDiv);
    }

    // Add Deep Search Toggle if hidden matches exist
    if (foundHiddenMatchesCount > 0 && !deepSearchActive) {
        const toggleDiv = document.createElement('div');
        toggleDiv.id = 'deepSearchToggle';
        toggleDiv.className = 'col-span-full mt-4 mb-8'; // Added margin for spacing
        toggleDiv.innerHTML = `
            <button onclick="toggleDeepSearch()" class="w-full py-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 group">
                <svg class="w-5 h-5 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                <span class="font-medium">Found ${foundHiddenMatchesCount} more matches in History. <span class="underline">Search Everywhere?</span></span>
            </button>
        `;
        container.appendChild(toggleDiv);
    }

    // == FLIP ANIMATION: LAST, INVERT, PLAY ==
    container.querySelectorAll('.work-card').forEach(newCard => {
        const id = newCard.getAttribute('data-work-id');
        const oldPos = oldPositions.get(id);

        if (oldPos) {
            const newPos = newCard.getBoundingClientRect();
            const deltaX = oldPos.left - newPos.left;
            const deltaY = oldPos.top - newPos.top;

            // Only animate if the element actually moved
            if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                // INVERT: Move it back to where it was
                newCard.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                newCard.style.transition = 'none';
                newCard.style.zIndex = '10'; // Ensure it slides over others

                // PLAY: Animate to new position
                requestAnimationFrame(() => {
                    // Force reflow
                    newCard.offsetHeight;

                    // Disable hover effects during animation to prevent conflict/stutter
                    newCard.style.pointerEvents = 'none';

                    newCard.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    newCard.style.transform = '';

                    // Cleanup z-index and re-enable pointer events
                    setTimeout(() => {
                        newCard.style.zIndex = '';
                        newCard.style.pointerEvents = '';
                    }, 500);
                });
            }
        } else if (oldPositions.size > 0) {
            // Entry animation for new cards (if list wasn't empty)
            newCard.style.opacity = '0';
            newCard.style.transform = 'translateY(10px)'; // Minimal slide up
            newCard.style.transition = 'none';

            requestAnimationFrame(() => {
                newCard.offsetHeight; // Reflow
                newCard.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; // Faster, smoother
                newCard.style.opacity = '1';
                newCard.style.transform = 'translateY(0)';
            });
        }
    });
}

// == UPDATED: WORK CARD SCRIPT ==
function createWorkCard(work) {
    const isOverdueWork = isOverdue(work);
    const deadlineText = formatDeadline(work);
    const staffName = (work.assigned_staff || '').trim();
    const avatar = memberAvatars[staffName] || 'default-avatar.jpg';
    const isUnassigned = !staffName || staffName.toLowerCase() === 'unassigned';

    // Better Staff Display Logic for Work Cards
    const staffAvatarHtml = isUnassigned 
        ? `<div class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-gray-50 shadow-sm">
             <svg class="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
           </div>`
        : `<div class="relative w-6 h-6">
               <img src="${avatar}" alt="${staffName}" class="w-full h-full rounded-full object-cover ring-2 ring-gray-50 shadow-sm" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="hidden absolute inset-0 w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center ring-2 ring-gray-50 shadow-sm"><span class="text-[9px] font-bold text-indigo-600">${staffName[0]}</span></div>
           </div>`;

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

    // Filter out year from deadlineText (User request)
    const cleanDeadlineText = deadlineText.replace(/, \d{4}/, '');

    // Bottom-Left Image Thumbnail Logic
    const imageThumbnail = work.images && work.images.length > 0 ? `
        <div class="relative group/image mr-2">
            <img src="${work.images[0]}" alt="Work image" class="w-10 h-10 object-cover rounded-md border border-gray-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onclick="event.stopPropagation(); viewImage('${work.images[0]}')">
            ${work.images.length > 1 ? `
                <div class="absolute -top-1.5 -right-1.5 bg-gray-900 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white shadow-sm pointer-events-none">
                    +${work.images.length - 1}
                </div>
            ` : ''}
        </div>
    ` : '';

    return `
        <div data-work-id="${work.id}" class="work-card group p-5 bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 border border-gray-100 min-w-0 flex flex-col h-full ${isOverdueWork ? 'bg-red-50/50 border-red-100' : ''}" onclick="showWorkDetails(${work.id})">
            
            <div class="flex justify-between items-start mb-2">
                <span class="text-xs font-semibold tracking-wide uppercase text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md truncate max-w-[60%]">${work.category || 'No Category'}</span>
                
                 <button class="status-button flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${statusColors[work.status] || 'bg-gray-100 text-gray-700'} ${isUpdating ? 'opacity-50' : 'hover:ring-2 hover:ring-offset-1 hover:ring-indigo-100'}" 
                        onclick="event.stopPropagation(); ${!isUpdating ? `showStatusDropdown(${work.id}, '${work.status}', this)` : ''}"
                        ${isUpdating ? 'disabled' : ''}>
                    <span>${isUpdating ? '...' : work.status}</span>
                    ${!isUpdating ? `<svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>` : ''}
                </button>
            </div>

            <h3 class="font-semibold text-gray-800 text-lg leading-snug mb-3 line-clamp-2 ${isOverdueWork ? 'text-red-700' : ''}" title="${work.work_name || 'Untitled Work'}">${work.work_name || 'Untitled Work'}</h3>

            <div class="flex flex-wrap items-center gap-y-2 gap-x-3 mb-3">
                <div class="flex items-center gap-2">
                    ${staffAvatarHtml}
                    <span class="text-sm font-medium ${isUnassigned ? 'text-gray-400 italic' : 'text-gray-700'} mt-1 truncate max-w-[100px]">${isUnassigned ? 'Unassigned' : staffName}</span>
                </div>
                
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-md ${isOverdueWork ? 'bg-red-100/50 text-red-700' : 'bg-gray-50 text-gray-600'}">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <span class="text-xs font-medium">${cleanDeadlineText}</span>
                </div>
            </div>

            <div class="mt-auto"></div>
            
            <div class="h-px bg-gray-50 mb-3"></div>

            <div class="flex items-center justify-between h-10">
                <div class="flex items-center gap-2">
                    ${imageThumbnail}
                    <span class="text-xs text-gray-400 whitespace-nowrap">${formatRelativeTime(work.created_at)}</span>
                </div>

                <div class="flex items-center gap-1 pl-2">
                    ${work.whatsapp_number ? `
                        <button onclick="event.stopPropagation(); copyToClipboard('${work.whatsapp_number}', this)" 
                            class="text-emerald-500 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-1" title="WhatsApp">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.394"></path></svg>
                            <span class="text-xs font-medium">${work.whatsapp_number}</span>
                        </button>
                    ` : ''}
                    
                    <button onclick="event.stopPropagation(); window.editWork(${work.id})" class="text-gray-400 hover:text-indigo-600 p-1.5 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    
                    <button onclick="event.stopPropagation(); showDeleteConfirmation(${work.id}, '${work.work_name}')" class="text-gray-400 hover:text-red-600 p-1.5 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}



// == BACKUP: OLD WORK CARD ==
function createWorkCard_OLD(work) {
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

    // Horizontal Layout: Image Logic - Updated for Bottom-Left Thumbnail
    const imageThumbnail = work.images && work.images.length > 0 ? `
        <div class="relative group/image mr-2">
            <img src="${work.images[0]}" alt="Work image" class="w-10 h-10 object-cover rounded-md border border-gray-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onclick="event.stopPropagation(); viewImage('${work.images[0]}')">
            ${work.images.length > 1 ? `
                <div class="absolute -top-1.5 -right-1.5 bg-gray-900 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white shadow-sm pointer-events-none">
                    +${work.images.length - 1}
                </div>
            ` : ''}
        </div>
    ` : '';

    return `
        <div class="work-card group p-5 bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 border border-gray-100 min-w-0 flex flex-col h-full ${isOverdueWork ? 'bg-red-50/50 border-red-100' : ''}" onclick="showWorkDetails(${work.id})">
            
            <!-- Main Content Row (Text Left, Image Right) -->
            <div class="flex items-start justify-between mb-3 flex-1">
                <div class="min-w-0 flex-1 pr-2">
                    <!-- Header with Title & Status -->
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex-1 min-w-0 mr-2">
                             <h3 class="font-bold text-gray-800 text-lg leading-snug break-words mb-1 ${isOverdueWork ? 'text-red-800' : ''}">${work.work_name}</h3>
                             <p class="text-sm font-medium text-gray-500 uppercase tracking-wide truncate">${work.category || 'No Category'}</p>
                        </div>
                        
                        <!-- Status Badge -->
                         <button class="status-button flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${statusColors[work.status] || 'bg-gray-100 text-gray-700'} ${isUpdating ? 'opacity-50' : ''}" 
                                onclick="event.stopPropagation(); ${!isUpdating ? `showStatusDropdown(${work.id}, '${work.status}', this)` : ''}"
                                ${isUpdating ? 'disabled' : ''}>
                            ${isUpdating ? '...' : work.status}
                        </button>
                    </div>

                    <!-- Staff (Middle) -->
                    <div class="flex items-center gap-2 mt-3">
                        ${staffAvatarHtml}
                        <span class="text-sm font-semibold text-gray-700 truncate">${work.assigned_staff}</span>
                    </div>
                </div>

                ${imageThumbnail}
            </div>
            
            <!-- Footer Divider -->
            <div class="h-px bg-gray-100 my-3"></div>

            <!-- Footer Actions -->
            <div class="flex items-center justify-between mt-auto">
                <!-- Date / Overdue -->
                <div class="flex items-center gap-1.5 text-sm text-gray-500">
                     <svg class="w-4 h-4 ${isOverdueWork ? 'text-red-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                     <span class="font-medium ${isOverdueWork ? 'text-red-700 font-bold' : ''}">${deadlineText}</span>
                     ${isOverdueWork ? '<span class="text-red-600 font-bold text-xs animate-pulse">⚠️</span>' : ''}
                </div>

                <!-- Right Actions -->
                <div class="flex items-center gap-3">
                    ${work.whatsapp_number ? `
                        <button onclick="event.stopPropagation(); copyToClipboard('${work.whatsapp_number}', this)" 
                            class="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-50 transition-colors font-medium flex items-center gap-1" title="WhatsApp">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.394"></path></svg>
                            <span class="hidden sm:inline">${work.whatsapp_number}</span>
                        </button>
                    ` : ''}
                    
                    <button onclick="event.stopPropagation(); editWork(${work.id})" class="text-gray-400 hover:text-indigo-600 p-1.5 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    
                    <button onclick="event.stopPropagation(); showDeleteConfirmation(${work.id}, '${work.work_name}')" class="text-gray-400 hover:text-red-600 p-1.5 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// == STATUS DROPDOWN ==
function showStatusDropdown(workId, currentStatus, buttonElement) {
    // Use modern status modal instead of old dropdown
    if (typeof showModernStatusModal === 'function') {
        showModernStatusModal(workId, currentStatus, buttonElement);
    } else {
        // Fallback to old method if modern-ui.js not loaded
        document.querySelectorAll('.status-dropdown-menu').forEach(dropdown => {
            dropdown.remove();
        });

        const statusOptions = [
            { value: 'Pending', color: 'bg-orange-100 text-orange-800', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' },
            { value: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>' },
            { value: 'Proof', color: 'bg-purple-100 text-purple-800', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>' },
            { value: 'Unpaid', color: 'bg-red-100 text-red-800', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' },
            { value: 'Completed', color: 'bg-green-100 text-green-800', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' }
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
        updateMemberTiles();
        updateRecentActivity();

        showNotification(`Status updated to ${newStatus}`, 'success');

        const work = works.find(w => w.id === workId);
        if (work) {
            showBrowserNotification('Status Updated', {
                body: `"${work.work_name}" is now ${newStatus}`,
                tag: 'status-change'
            });
        }

        setTimeout(async () => {
            await refreshWorks();
        }, 1000);

    } catch (error) {
        console.error('Error updating work status:', error);
        showNotification('Failed to update status', 'error');
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
        <div class="mt-4">
            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Images (${work.images.length})</h4>
            <div class="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                ${work.images.map(img => `
                    <div class="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-gray-200 cursor-pointer">
                        <img src="${img}" alt="Work image" class="w-full h-full object-cover" onclick="viewImage('${img}')">
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    const content = `
        <div class="space-y-4">
            <!-- Header -->
            <div class="flex justify-between items-start">
                <div class="flex-1 pr-12">
                     <h3 class="text-xl font-bold text-gray-800 leading-tight mb-2">${work.work_name}</h3>
                     <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColors[work.status]} mb-2 inline-block">${work.status}</span>
                     ${isOverdueWork ? '<span class="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full animate-pulse">⚠️ Overdue</span>' : ''}
                     <p class="text-sm text-gray-500 mt-1 uppercase tracking-wide font-medium">${work.category || 'No Category'}</p>
                </div>

            </div>

            <!-- Description (Compact) -->
            ${work.description ? `
                <div class="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <h4 class="text-xs font-bold text-gray-400 uppercase mb-1">Description</h4>
                    <p class="text-gray-700 text-sm whitespace-pre-wrap selectable-text ${work.description.length > 100 ? 'line-clamp-2' : ''}" id="desc_${work.id}">${work.description}</p>
                    ${work.description.length > 100 ? `<button onclick="this.previousElementSibling.classList.toggle('line-clamp-2'); this.textContent = this.previousElementSibling.classList.contains('line-clamp-2') ? 'See more' : 'See less'" class="text-blue-600 text-xs mt-1 font-medium hover:underline focus:outline-none">See more</button>` : ''}
                </div>
            ` : ''}

            ${imagesSection}

            <!-- Key Details Grid -->
            <div class="grid grid-cols-2 gap-x-4 gap-y-4 bg-white rounded-xl border border-gray-100 p-4">
                 <div>
                    <span class="text-gray-400 text-xs font-medium block uppercase tracking-wider">Assigned To</span>
                    <div class="flex items-center gap-2 mt-1">
                        <div class="relative w-8 h-8">
                            <img src="${avatar}" class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100" 
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="hidden absolute inset-0 w-8 h-8 rounded-full bg-indigo-50 items-center justify-center ring-2 ring-indigo-100">
                                <span class="text-[10px] font-bold text-indigo-600">${(work.assigned_staff || 'U')[0]}</span>
                            </div>
                        </div>
                        <div class="text-sm font-semibold text-gray-700">${work.assigned_staff || 'Unassigned'}</div>
                    </div>
                 </div>
                 <div>
                    <span class="text-gray-400 text-xs font-medium block uppercase tracking-wider">Deadline</span>
                    <div class="mt-1 flex items-center text-sm font-medium ${isOverdueWork ? 'text-red-600' : 'text-gray-700'}">
                        ${isOverdueWork ? '⚠️ ' : '📅 '}${deadlineText}
                    </div>
                 </div>
                 
                 ${work.mrp ? `
                 <div class="border-t border-gray-50 pt-3">
                    <span class="text-gray-400 text-xs font-medium block uppercase tracking-wider">MRP</span>
                    <span class="font-bold text-gray-800 mt-1 block">₹${work.mrp}</span>
                 </div>` : ''}
                 
                 ${work.quotation_rate ? `
                 <div class="border-t border-gray-50 pt-3">
                    <span class="text-gray-400 text-xs font-medium block uppercase tracking-wider">Quotation Rate</span>
                    <span class="font-bold text-gray-800 mt-1 block">₹${work.quotation_rate}</span>
                 </div>` : ''}
             </div>

             <!-- Metadata Footer -->
             <div class="flex items-center justify-between text-xs text-gray-400 pt-2 px-1">
                 <div><span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mr-1">Added by</span><span class="font-medium text-gray-700">${work.created_by}</span></div>
                 <div>${formatRelativeTime(work.created_at)}</div>
             </div>

             <div class="flex gap-2 pt-4 border-t border-gray-100 mt-2">
                 ${work.whatsapp_number ? `
                     <button onclick="copyToClipboard('${work.whatsapp_number}', this)" 
                             class="w-1/2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors font-medium text-sm flex items-center justify-center gap-2">
                         <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                             <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.394"></path>
                         </svg>
                         <span class="truncate">${work.whatsapp_number}</span>
                     </button>
                 ` : ''}

                <button onclick="closeWorkDetailsModal(); editWork(${work.id});" 
                        class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-md shadow-blue-200">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                    <span>Edit</span>
                </button>
                <button onclick="showDeleteConfirmation(${work.id}, '${work.work_name}'); closeWorkDetailsModal();" 
                        class="px-3 py-2 bg-white text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;

    const modalContent = document.getElementById('workDetailsContent');
    if (modalContent) {
        modalContent.innerHTML = content;
        document.getElementById('workDetailsModal').classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }
}

function editWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;

    editingWorkId = workId;
    currentWorkImages = work.images ? [...work.images] : [];
    editUploadedImages = [];

    document.getElementById('editWorkName').value = work.work_name || '';
    document.getElementById('editWorkCategory').value = work.category || '';
    const editCategoryInput = document.getElementById('editCategoryInput');
    if (editCategoryInput) {
        editCategoryInput.value = work.category || '';
    }
    const categoryText = document.getElementById('editCategoryText');
    if (categoryText) {
        categoryText.textContent = work.category || 'Select Category';
    }
    document.getElementById('editWhatsappNumber').value = work.whatsapp_number || '';
    document.getElementById('editWorkDescription').value = work.description || '';
    document.getElementById('editWorkMrp').value = work.mrp || '';
    document.getElementById('editWorkQuotationRate').value = work.quotation_rate || '';

    // Update Staff Selection
    const assignedStaff = work.assigned_staff || '';
    document.getElementById('editAssignStaff').value = assignedStaff;
    if (typeof window.selectStaffOption === 'function') {
        window.selectStaffOption(assignedStaff, 'editAssignStaffContainer', 'editAssignStaff');
    } else if (typeof selectStaffOption === 'function') {
        selectStaffOption(assignedStaff, 'editAssignStaffContainer', 'editAssignStaff');
    }

    document.getElementById('editWorkStatus').value = work.status || 'Pending';
    const deadlineDate = work.deadline || '';
    document.getElementById('editWorkDeadline').value = deadlineDate;
    if (typeof window.updateDateButtons === 'function') {
        window.updateDateButtons(deadlineDate, 'editWorkDateButtons');
    } else if (typeof updateDateButtons === 'function') {
        updateDateButtons(deadlineDate, 'editWorkDateButtons');
    }

    document.getElementById('editWorkDeadlineTime').value = work.deadline_time || '';
    if (typeof window.selectTimeOption === 'function') {
        window.selectTimeOption(work.deadline_time || '', 'editWorkDeadlineTimeContainer', true);
    } else if (typeof selectTimeOption === 'function') {
        selectTimeOption(work.deadline_time || '', 'editWorkDeadlineTimeContainer', true);
    }
    document.getElementById('editWorkPriority').value = work.priority || 'Medium';

    updateEditImagePreview();
    document.getElementById('editWorkModal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

async function executeDeleteWork(workId) {
    try {
        const { error } = await sb
            .from('works')
            .delete()
            .eq('id', workId);

        if (error) throw error;

        const detailsModal = document.getElementById('workDetailsModal');
        if (detailsModal) detailsModal.classList.add('hidden');

        unlockBodyScroll();

        await refreshWorks();
        showNotification('Work deleted successfully!', 'success');

    } catch (error) {
        console.error('Error deleting work:', error);
        showNotification('Failed to delete work', 'error');
        unlockBodyScroll();
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
    if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours}h ago`;
    }
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.toDateString() === date.toDateString()) return 'Yesterday';
    
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

    const loaderHTML = `<svg class="w-6 h-6 animate-spin mx-auto text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    if (totalWorksElement) totalWorksElement.innerHTML = isWorksLoaded ? totalWorksCount : loaderHTML;
    if (activeWorksElement) activeWorksElement.innerHTML = isWorksLoaded ? activeWorksCount : loaderHTML;
    if (unpaidWorksElement) unpaidWorksElement.innerHTML = isWorksLoaded ? unpaidWorksCount : loaderHTML;
    if (completedWorksElement) completedWorksElement.innerHTML = isWorksLoaded ? completedWorksCount : loaderHTML;
    if (dueTodayWorksElement) dueTodayWorksElement.innerHTML = isWorksLoaded ? dueTodayWorksCount : loaderHTML;

    updateWorkViewTabsUI();
}

function updateRecentActivity() {
    const recentActivityElement = document.getElementById('recentActivity');
    if (!recentActivityElement) return;

    // Filter to show only 20 most recently created works
    const recentWorks = works
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);

    if (recentWorks.length === 0) {
        recentActivityElement.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full py-8 text-gray-400">
                <svg class="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-sm">No recent activity</p>
            </div>
        `;
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

        const creator = work.created_by === currentUser ? 'You' : work.created_by;

        return `
            <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group" onclick="showWorkDetails(${work.id})">
                <div class="relative w-9 h-9">
                    <img src="${avatar}" alt="${work.assigned_staff}" class="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="hidden absolute inset-0 w-9 h-9 rounded-full bg-indigo-50 items-center justify-center ring-2 ring-white shadow-sm">
                        <span class="text-xs font-bold text-indigo-600">${(work.assigned_staff || 'U')[0]}</span>
                    </div>
                </div>
                
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-gray-800 text-sm truncate group-hover:text-primary transition-colors">${work.work_name}</div>
                    <div class="text-xs text-gray-500 flex items-center gap-1">
                        <span>Added by <span class="font-medium text-gray-700">${creator}</span></span>
                    </div>
                </div>
                
                <div class="flex flex-col items-end justify-center min-w-[70px]">
                     <span class="text-xs font-bold text-gray-500">${formatRelativeTime(work.created_at)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function resetForm() {
    convertingEnquiryId = null;
    const form = document.getElementById('workForm');
    if (form) {
        form.reset();
    }

    const categoryText = document.getElementById('categoryText');
    if (categoryText) categoryText.textContent = 'Select Category';

    const priorityText = document.getElementById('priorityText');
    if (priorityText) priorityText.textContent = 'Medium';

    const categoryInput = document.getElementById('categoryInput');
    if (categoryInput) {
        categoryInput.value = '';
        filterCategories('');
    }

    const workCategory = document.getElementById('workCategory');
    if (workCategory) workCategory.value = '';

    const assignStaff = document.getElementById('assignStaff');
    if (assignStaff) assignStaff.value = '';

    // Reset Staff Selection
    const staffContainer = document.getElementById('assignStaffContainer');
    if (staffContainer) {
        staffContainer.querySelectorAll('.staff-option').forEach(option => {
            const img = option.querySelector('img');
            const checkIcon = option.querySelector('.check-icon');
            const label = option.querySelector('span');

            if (img) {
                img.classList.add('ring-transparent', 'grayscale');
                img.classList.remove('ring-indigo-500', 'ring-offset-2');
            }
            if (checkIcon) checkIcon.classList.add('opacity-0');
            if (label) {
                label.classList.remove('text-indigo-600', 'font-bold');
                label.classList.add('text-gray-500');
            }
        });
    }

    const priorityEl = document.getElementById('workPriority');
    if (priorityEl) priorityEl.value = 'Medium';

    document.getElementById('workDeadline').value = '';
    updateDateButtons('', 'workDateButtons');

    // Reset Deadline Time
    document.getElementById('workDeadlineTime').value = '';
    const timeContainer = document.getElementById('workDeadlineTimeContainer');
    if (timeContainer) {
        timeContainer.querySelectorAll('.time-option').forEach(option => {
            option.classList.remove('selected');
        });
    }
}

function showTab(tabName) {
    if (tabName !== 'works') {
        currentSearchTerm = '';
        deepSearchActive = false;
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
        tab.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm', 'ring-1', 'ring-black/5');
        tab.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
    });

    const activeTabs = document.querySelectorAll(`[data-tab="${tabName}"]`);
    activeTabs.forEach(activeTab => {
        activeTab.classList.add('bg-white', 'text-indigo-600', 'shadow-sm', 'ring-1', 'ring-black/5');
        activeTab.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
    });

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
    } else if (tabName === 'enquiries') {
        refreshEnquiries();
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
window.setWorkViewMode = setWorkViewMode;
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
window.clearSearch = clearSearch;
window.toggleDeepSearch = toggleDeepSearch;

// Quick tasks functions (Removed due to missing implementation)

// Enquiry exports

// Image functions
window.handleImageUpload = handleImageUpload;
window.handleEditImageUpload = handleEditImageUpload;
window.removeImage = removeImage;
window.viewImage = viewImage;
window.closeImageViewer = closeImageViewer;
window.downloadImage = downloadImage;
window.copyImage = copyImage;


// Edit Work Category Dropdown Exports
window.toggleEditCategorySearchDropdown = toggleEditCategorySearchDropdown;
window.filterEditCategories = filterEditCategories;
window.handleEditCategoryKeydown = handleEditCategoryKeydown;
window.selectEditCategory = selectEditCategory;

window.handleEditModalClick = handleEditModalClick;

// Staff Selection Logic
function setupStaffSelection() {
    renderStaffSelection('assignStaffContainer', 'assignStaff');
    renderStaffSelection('editAssignStaffContainer', 'editAssignStaff');
    renderStaffSelection('enquiryStaffContainer', 'enquiryStaff');
}

function renderStaffSelection(containerId, inputId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const staffMembers = ['Irshad', 'Niyas', 'Muhammed', 'Nihana', 'Safvan'];

    staffMembers.forEach(name => {
        const avatar = memberAvatars[name] || 'default-avatar.jpg';
        const div = document.createElement('div');
        div.className = 'staff-option flex flex-col items-center gap-2 cursor-pointer group transition-all duration-200';
        div.setAttribute('data-value', name);
        div.onclick = () => window.selectStaffOption(name, containerId, inputId);

        div.innerHTML = `
            <div class="relative w-12 h-12">
                <img src="${avatar}" alt="${name}" 
                     class="w-12 h-12 rounded-full object-cover ring-2 ring-transparent grayscale group-hover:grayscale-0 group-hover:ring-indigo-200 transition-all duration-300"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="hidden absolute inset-0 w-12 h-12 rounded-full bg-indigo-50 items-center justify-center ring-2 ring-indigo-200">
                    <span class="text-sm font-bold text-indigo-600">${name[0]}</span>
                </div>
                <div class="absolute -bottom-1 -right-1 bg-indigo-500 rounded-full p-0.5 opacity-0 transition-opacity duration-200 check-icon text-white ring-2 ring-white">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                </div>
            </div>
            <span class="text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">${name}</span>
        `;
        container.appendChild(div);
    });
}

function selectStaffOption(name, containerId, inputId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;

    input.value = name;

    container.querySelectorAll('.staff-option').forEach(option => {
        const isSelected = option.getAttribute('data-value') === name;
        const img = option.querySelector('img');
        const checkIcon = option.querySelector('.check-icon');
        const label = option.querySelector('span');

        if (isSelected) {
            if (img) {
                img.classList.remove('ring-transparent', 'grayscale');
                img.classList.add('ring-indigo-500', 'ring-offset-2');
            }
            checkIcon?.classList.remove('opacity-0');
            if (label) {
                label.classList.add('text-indigo-600', 'font-bold');
                label.classList.remove('text-gray-500');
            }
            option.classList.add('transform', 'scale-105');
        } else {
            if (img) {
                img.classList.add('ring-transparent', 'grayscale');
                img.classList.remove('ring-indigo-500', 'ring-offset-2');
            }
            checkIcon?.classList.add('opacity-0');
            if (label) {
                label.classList.remove('text-indigo-600', 'font-bold');
                label.classList.add('text-gray-500');
            }
            option.classList.remove('transform', 'scale-105');
        }
    });
}

window.selectStaffOption = selectStaffOption;

// Date Handling Functions
function setDeadlineDate(type, inputId, containerId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Use current date for Today to ensure correct local date calculation
    const today = new Date();
    let targetDate;

    if (type === 'today') {
        targetDate = today;
    } else if (type === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        targetDate = tomorrow;
    }

    // Format YYYY-MM-DD
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;

    input.value = dateString;
    updateDateButtons(dateString, containerId);
}

window.setDeadlineDate = setDeadlineDate;

function updateDateButtons(dateValue, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const yyyyToday = today.getFullYear();
    const mmToday = String(today.getMonth() + 1).padStart(2, '0');
    const ddToday = String(today.getDate()).padStart(2, '0');
    const todayString = `${yyyyToday}-${mmToday}-${ddToday}`;

    const yyyyTom = tomorrow.getFullYear();
    const mmTom = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const ddTom = String(tomorrow.getDate()).padStart(2, '0');
    const tomString = `${yyyyTom}-${mmTom}-${ddTom}`;

    let activeType = null;
    if (dateValue === todayString) activeType = 'today';
    else if (dateValue === tomString) activeType = 'tomorrow';

    container.querySelectorAll('button').forEach(btn => {
        const type = btn.getAttribute('data-value');
        if (type === activeType) {
            btn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm', 'border', 'border-gray-100');
            btn.classList.remove('bg-primary', 'text-white', 'border-primary', 'bg-transparent', 'text-gray-500');
        } else {
            btn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm', 'border', 'border-gray-100', 'bg-primary', 'text-white', 'border-primary');
            btn.classList.add('bg-transparent', 'text-gray-500', 'hover:text-gray-900');
        }
    });
}

window.updateDateButtons = updateDateButtons;

// == UPDATE NOTES MODAL ==
function showUpdateNotes() {
    // Remove existing modal if any (to force update content)
    const existingModal = document.getElementById('updateNotesModal');
    if (existingModal) { existingModal.remove(); }

    const modal = document.createElement('div');
    modal.id = 'updateNotesModal';
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 opacity-0 pointer-events-none transition-opacity duration-300';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick="closeUpdateNotes()"></div>
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform scale-95 transition-transform duration-300 overflow-hidden relative z-10">
            <div class="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-white relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10">
                    <svg class="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <div class="relative z-10">
                    <span class="inline-block py-1 px-3 rounded-full bg-white/20 text-xs font-bold tracking-wider mb-3 backdrop-blur-md border border-white/20 shadow-sm">MAJOR UPDATE</span>
                    <h2 class="text-3xl font-extrabold mb-2 tracking-tight">Welcome to v6.0</h2>
                    <p class="text-indigo-100 font-medium">Experience the new standard of productivity.</p>
                </div>
                <button onclick="closeUpdateNotes()" class="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full cursor-pointer">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="p-0 max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
                <div class="divide-y divide-gray-100">
                    <div class="p-6 hover:bg-gray-50 transition-colors group">
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"/></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-gray-900 text-lg">Full Database Loader</h3>
                                <p class="text-gray-600 text-sm mt-1 leading-relaxed">No more truncated lists. We load all 2400+ works dynamically, making older entries (like Najil's completed works) instantly searchable.</p>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 hover:bg-gray-50 transition-colors group">
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-gray-900 text-lg">Background Notifications</h3>
                                <p class="text-gray-600 text-sm mt-1 leading-relaxed">PWA Service Worker integration ensures you get real-time browser alerts even when the app is minimized to the taskbar.</p>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 hover:bg-gray-50 transition-colors group">
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-gray-900 text-lg">Native Date Calendar</h3>
                                <p class="text-gray-600 text-sm mt-1 leading-relaxed">No more clicking on the tiny calendar icon. Clicking anywhere on the deadline date field now opens the calendar picker immediately.</p>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 hover:bg-gray-50 transition-colors group">
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-gray-900 text-lg">Streamlined Workspace</h3>
                                <p class="text-gray-600 text-sm mt-1 leading-relaxed">Cleaned up the interface by removing redundant filters and clear buttons, making the workspace extremely tidy and focused.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-6 bg-gray-50 border-t border-gray-100">
                <button onclick="closeUpdateNotes()" class="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold shadow-lg shadow-gray-200 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer">Explore v6.0 Features</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Animate in
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('.transform').classList.remove('scale-95');
        modal.querySelector('.transform').classList.add('scale-100');
    }, 10);
}

function closeUpdateNotes() {
    const modal = document.getElementById('updateNotesModal');
    if (modal) {
        modal.querySelector('.transform').classList.remove('scale-100');
        modal.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('opacity-0', 'pointer-events-none');
        }, 300);
    }
}

window.showUpdateNotes = showUpdateNotes;
window.closeUpdateNotes = closeUpdateNotes;

// Expose Enquiry Functions Globally
window.showAddEnquiryModal = showAddEnquiryModal;
window.closeAddEnquiryModal = closeAddEnquiryModal;
window.handleEnquirySubmit = handleEnquirySubmit;
window.filterEnquiriesByStatus = filterEnquiriesByStatus;
window.handleEnquirySearch = handleEnquirySearch;
window.openWhatsAppChat = openWhatsAppChat;
window.showEditEnquiryModal = showEditEnquiryModal;
window.closeEditEnquiryModal = closeEditEnquiryModal;
window.handleEditEnquirySubmit = handleEditEnquirySubmit;
window.convertEnquiryToWork = convertEnquiryToWork;
window.deleteEnquiry = deleteEnquiry;
window.closeEnquiryDeleteModal = closeEnquiryDeleteModal;
window.toggleEnquiryStatusDropdown = toggleEnquiryStatusDropdown;
window.updateEnquiryStatus = updateEnquiryStatus;


// == GLOBAL ESCAPE HANDLER (FIX Z-ORDER) ==
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const imageModal = document.getElementById('imageViewerModal');

        // Priority 1: Image Viewer (Highest Z-Index)
        if (imageModal && !imageModal.classList.contains('hidden')) {
            // Close Image Viewer specifically
            if (typeof closeImageViewer === 'function') {
                closeImageViewer();
            } else if (typeof window.closeImageViewer === 'function') {
                window.closeImageViewer();
            } else {
                // Fallback manual close
                imageModal.classList.add('hidden');
            }
            // CRITICAL: Stop propagation so underlying Listeners (Work Details) don't receive this event
            event.stopImmediatePropagation();
            event.preventDefault();
        }
        unlockBodyScroll();
    }
}, true); // Capture Phase: True
