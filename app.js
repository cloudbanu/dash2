// == CONFIGURATION ==
const SUPABASE_URL = 'https://icmlxulaxsacuvlkghlz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbWx4dWxheHNhY3V2bGtnaGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTk0MTgsImV4cCI6MjA2ODY5NTQxOH0.zVGLqIpCIlMoSQAInaCybz9bY1zq82IL9DC5uMs1tFQ'; // (full key as in your post)

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

// == In-memory state ==
let currentUser = null;
let currentUserRole = null;
let works = [];
let currentWorkId = null;
let editingWorkId = null;
let currentFilters = {
  member: 'all', status: 'all', deadline: 'all', creator: 'all', sort: 'newest'
};
let notifications = [];

// == DOMContentLoaded ==
document.addEventListener('DOMContentLoaded', async function() {
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  // Toasts container for notifications
  createToastsContainer();

  // Fetch & subscribe to realtime
  await refreshWorks();
  subscribeToWorks();
  subscribeToNotifications();
  renderWorks();
  updateStats();
});

// == TOAST NOTIFICATIONS ==
function createToastsContainer() {
  if (!document.getElementById('toastContainer')) {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.style = `
      position: fixed; bottom: 2rem; right: 2rem; z-index: 99999; display: flex; flex-direction: column; gap: 10px; align-items: flex-end;
    `;
    document.body.appendChild(el);
  }
}
function showToastAvatar(msg, profile, avatar) {
  const toast = document.createElement('div');
  toast.className = "bg-white shadow-2xl border border-gray-200 px-5 py-4 rounded-lg flex items-center gap-3 animate-bounce-in";
  toast.innerHTML = `
    <img src="${avatar || 'logo.png'}" class="w-10 h-10 rounded-full border">
    <div>
      <div class="font-medium text-gray-800">${msg}</div>
      <div class="text-xs text-gray-500">${profile ? new Date().toLocaleTimeString() : ""}</div>
    </div>
  `;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), 3250);
}
// Animation
const styleAnim = document.createElement("style");
styleAnim.innerHTML = `.animate-bounce-in {animation: bounceIn .4s cubic-bezier(.4,2,.6,.8);} @keyframes bounceIn{0%{opacity:0;transform: scale(0.5);} 80%{opacity:1;transform:scale(1.04);}100%{opacity:1;transform:scale(1);} }`;
document.head.appendChild(styleAnim);

// == LOGIN/LOGOUT ==
window.login = async function(name, role) {
  currentUser = name;
  currentUserRole = role;
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').src = memberAvatars[name];
  await refreshWorks();
  renderWorks();
  updateStats();
  showTab('dashboard');
};
window.logout = function() {
  currentUser = null; currentUserRole = null; editingWorkId = null;
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
};

// == DATE/TIME ==
function updateDateTime() {
  const now = new Date();
  const timeOpt = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  const dateOpt = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('currentTime').textContent = now.toLocaleTimeString('en-US', timeOpt);
  document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', dateOpt);
}

// == TABS ==
window.showTab = function(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('bg-blue-600'); tab.classList.add('hover:bg-gray-700');
  });
  document.getElementById(tabName).classList.remove('hidden');
  const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeTab) { activeTab.classList.add('bg-blue-600'); activeTab.classList.remove('hover:bg-gray-700'); }
  if(tabName === 'works') renderWorks();
  else if (tabName === 'add-work' && !editingWorkId) resetForm();
};

// == FORM SUBMISSION ==
window.submitWork = async function(event) {
  event.preventDefault();
  const fields = {
    name: document.getElementById('workName').value, 
    description: document.getElementById('workDescription').value,
    whatsapp_number: document.getElementById('whatsappNumber').value,
    assigned_staff: document.getElementById('assignedStaff').value,
    deadline: document.getElementById('workDeadline').value,
    priority: document.getElementById('workPriority').value || 'medium'
  };
  if(editingWorkId) {
    // update
    await supabase.from('works').update({
      ...fields, updated_by: currentUser, updated_at: new Date().toISOString()
    }).eq('id', editingWorkId);
    showToastAvatar('Work updated!', currentUser, memberAvatars[currentUser]);
    editingWorkId = null;
  } else {
    // add new
    const { data, error } = await supabase.from('works').insert({
      ...fields, created_by: currentUser, created_at: new Date().toISOString(), status: 'pending'
    }).select();
    // push notification
    if (!error && data && data[0]) {
      await supabase.from('notifications').insert({
        message: `${currentUser} added a new work`,
        profile_name: currentUser, profile_avatar: memberAvatars[currentUser]
      });
    }
  }
  resetForm();
  updateStats();
  showTab('works');
};
window.resetForm = function() {
  document.getElementById('workName').value = '';
  document.getElementById('workDescription').value = '';
  document.getElementById('whatsappNumber').value = '';
  document.getElementById('assignedStaff').value = '';
  document.getElementById('workDeadline').value = '';
  document.getElementById('workPriority').value = 'medium';
  editingWorkId = null;
  document.getElementById('workFormTitle').textContent = 'Add New Work';
  document.getElementById('submitBtn').innerHTML = `<svg class="w-4 h-4"><use href="#add-icon"/></svg><span>Add Work</span>`;
};
window.cancelEdit = function() { resetForm(); showTab('works'); };

// == FILTERING ==
window.filterWorks = function(member) {
  currentFilters.member = member;
  document.querySelectorAll('.member-filter-btn').forEach(btn => {
    btn.classList.remove('bg-gray-800', 'text-white'); 
    btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
  });
  event.target.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
  event.target.classList.add('bg-gray-800', 'text-white');
  applyFilters();
};
window.applyFilters = function() {
  currentFilters.status = document.getElementById('statusFilter').value;
  currentFilters.deadline = document.getElementById('deadlineFilter').value;
  currentFilters.creator = document.getElementById('creatorFilter').value;
  currentFilters.sort = document.getElementById('sortFilter').value;
  renderWorks();
};

// == FETCH and SYNC ==
async function refreshWorks() {
  const { data, error } = await supabase.from('works').select('*').order('created_at', {ascending:false});
  if(!error) works = data || [];
  updateStats();
  renderWorks();
}

// == REALTIME SYNC ==
function subscribeToWorks() {
  supabase.channel('public:works')
    .on('postgres_changes', { event: '*', schema:'public', table:'works' }, async () => {
      await refreshWorks();
      updateStats();
      renderWorks();
    }).subscribe();
}
function subscribeToNotifications() {
  supabase.channel('public:notifications')
    .on('postgres_changes', { event: 'insert', schema:'public', table:'notifications' }, payload => {
       const note = payload.new;
       showToastAvatar(note.message, note.profile_name, note.profile_avatar);
    }).subscribe();
}

// == WORK LIST RENDERING ==
// ... (all helper functions like getPriorityClass... etc, same as in your original)
// Copy below unchanged logic:
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
  const today = new Date(); today.setHours(0,0,0,0);
  const deadlineDate = new Date(deadline); deadlineDate.setHours(0,0,0,0);
  if(deadlineDate.getTime() === today.getTime())
    return {type:'today', text:'Due Today', class:"bg-orange-100 text-orange-800"};
  if(deadlineDate < today)
    return {type:'overdue', text:'Overdue', class:"bg-red-100 text-red-800"};
  return null;
}

function getFilteredWorks() {
  let filteredWorks = [...works];
  if(currentFilters.member !== 'all')
    filteredWorks = filteredWorks.filter(w => w.assigned_staff === currentFilters.member);
  if(currentFilters.status !== 'all')
    filteredWorks = filteredWorks.filter(w => w.status === currentFilters.status);
  if(currentFilters.creator !== 'all')
    filteredWorks = filteredWorks.filter(w => w.created_by === currentFilters.creator);
  if(currentFilters.deadline !== 'all') {
    const today = new Date(); today.setHours(0,0,0,0);
    filteredWorks = filteredWorks.filter(work => {
      if(!work.deadline) return currentFilters.deadline === 'all';
      const deadline = new Date(work.deadline); deadline.setHours(0,0,0,0);
      switch (currentFilters.deadline) {
        case 'today': return deadline.getTime() === today.getTime();
        case 'tomorrow': 
          const tmrw = new Date(today); tmrw.setDate(tmrw.getDate()+1);
          return deadline.getTime() === tmrw.getTime();
        case 'this-week':
          const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate()+7);
          return deadline >= today && deadline <= weekEnd;
        case 'overdue': return deadline < today && work.status !== 'completed';
        default: return true;
      }
    });
  }
  filteredWorks.sort((a,b)=>{
    switch(currentFilters.sort){
      case 'newest': return new Date(b.created_at)-new Date(a.created_at);
      case 'oldest': return new Date(a.created_at)-new Date(b.created_at);
      case 'deadline': if(!a.deadline&&!b.deadline) return 0; if(!a.deadline) return 1;
        if(!b.deadline) return -1;
        return new Date(a.deadline)-new Date(b.deadline);
      case 'status':
        const st = {'pending':0,'in-progress':1,'completed':2};
        return st[a.status]-st[b.status];
      default: return 0;
    }
  });
  return filteredWorks;
}

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
    // Permissions
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
            <img src="${memberAvatars[work.created_by]}" alt="${work.created_by}" class="w-4 h-4 rounded-full">
            <span class="text-gray-500">Created by:</span>
            <span class="font-medium text-blue-600">${work.created_by}</span>
          </div>
        </div>
        <div class="flex justify-between items-center text-xs text-gray-500 pt-3 border-t border-gray-100">
          <span>Created on ${createdDate}</span>
          ${work.whatsapp_number ? `
            <button onclick="event.stopPropagation(); copyWhatsAppNumber('${work.whatsapp_number}')" class="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600 transition-colors flex items-center space-x-1">
              <svg class="w-3 h-3"><use href="#phone-icon"/></svg>
              <span>Copy WhatsApp</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}
window.startEditWork = async function(workId) {
  const { data, error } = await supabase.from('works').select('*').eq('id', workId).single();
  if(error || !data) return;
  const work = data;
  if(currentUserRole !== 'admin' && work.created_by !== currentUser) {
    alert("You can only edit works that you created."); return;
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
};

// == MODAL, STATUS, DELETE, WHATSAPP ==
window.openWorkModal = async function (workId) {
  const { data, error } = await supabase.from('works').select('*').eq('id', workId).single();
  if(!data) return;
  const work = data; currentWorkId = workId;
  document.getElementById('modalWorkName').textContent = work.name;
  document.getElementById('modalDescription').textContent = work.description || 'No description provided';
  document.getElementById('modalAssigned').textContent = work.assigned_staff;
  document.getElementById('modalAssignedAvatar').src = memberAvatars[work.assigned_staff];
  document.getElementById('modalAssignedAvatarSmall').src = memberAvatars[work.assigned_staff];
  document.getElementById('modalDeadline').textContent = work.deadline ? new Date(work.deadline).toLocaleDateString() : 'No deadline';
  document.getElementById('modalCreatedBy').textContent = work.created_by;
  document.getElementById('modalCreatorAvatar').src = memberAvatars[work.created_by];
  document.getElementById('modalCreatedAt').textContent = new Date(work.created_at).toLocaleDateString();
  document.getElementById('modalStatus').value = work.status;
  document.getElementById('modalPriorityBadge').innerHTML = getPriorityBadge(work.priority);

  if (work.whatsapp_number) {
    document.getElementById('modalWhatsapp').classList.remove('hidden');
    document.getElementById('modalWhatsappNumber').value = work.whatsapp_number;
  } else { document.getElementById('modalWhatsapp').classList.add('hidden'); }

  // Permissions
  const statusSection = document.getElementById('statusUpdateSection');
  const statusSelect = document.getElementById('modalStatus');
  const editBtn = document.getElementById('editWorkBtn');
  const deleteBtn = document.getElementById('deleteWorkBtn');
  if (currentUserRole === 'admin' || work.assigned_staff === currentUser) {
    statusSelect.disabled = false; statusSection.classList.remove('hidden');
  } else { statusSelect.disabled = true; statusSection.classList.add('hidden'); }
  const canEdit = currentUserRole === 'admin' || work.created_by === currentUser;
  const canDelete = currentUserRole === 'admin' || work.created_by === currentUser;
  if (canEdit) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden');
  if (canDelete) deleteBtn.classList.remove('hidden'); else deleteBtn.classList.add('hidden');
  const workActions = document.getElementById('workActions');
  if (!canEdit && !canDelete) workActions.classList.add('hidden');
  else workActions.classList.remove('hidden');
  document.getElementById('workModal').classList.remove('hidden');
};
window.editWork = function() {
  if(currentWorkId) { closeModal(); startEditWork(currentWorkId); }
};
window.deleteWork = async function() {
  if(!currentWorkId) return;
  const { data: work } = await supabase.from('works').select('*').eq('id', currentWorkId).single();
  if(!work) return;
  if(currentUserRole !== 'admin' && work.created_by !== currentUser) {
    alert('You can only delete works that you created.'); return;
  }
  if(confirm('Are you sure you want to delete this work? This action cannot be undone.')) {
    await supabase.from('works').delete().eq('id', currentWorkId);
    closeModal(); updateStats(); renderWorks();
    alert('Work deleted successfully!');
  }
};
window.closeModal = function() {
  document.getElementById('workModal').classList.add('hidden'); currentWorkId = null;
};
window.updateWorkStatus = async function() {
  if(!currentWorkId) return;
  const { data: work } = await supabase.from('works').select('*').eq('id', currentWorkId).single();
  if(!work) return;
  if(currentUserRole !== 'admin' && work.assigned_staff !== currentUser) {
    alert('You can only update status of works assigned to you.'); return;
  }
  const newStatus = document.getElementById('modalStatus').value;
  await supabase.from('works').update({
    status: newStatus,
    status_updated_by: currentUser,
    status_updated_at: new Date().toISOString()
  }).eq('id', currentWorkId);
  updateStats(); renderWorks();
  showToastAvatar(`Work status updated to ${newStatus.replace('-',' ').toUpperCase()}`, currentUser, memberAvatars[currentUser]);
};
window.copyWhatsApp = function() {
  const number = document.getElementById('modalWhatsappNumber').value;
  copyWhatsAppNumber(number);
}
window.copyWhatsAppNumber = function(number) {
  navigator.clipboard.writeText(number).then(() => {
    const button = event.target.closest('button');
    const originalHTML = button.innerHTML;
    button.innerHTML = `<svg class="w-3 h-3"><use href="#copy-icon"/></svg><span>Copied!</span>`;
    button.classList.add('bg-green-600');
    setTimeout(() => { button.innerHTML = originalHTML; button.classList.remove('bg-green-600'); }, 2000);
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = number; document.body.appendChild(textArea); textArea.select();
    document.execCommand('copy'); document.body.removeChild(textArea);
    alert('WhatsApp number copied to clipboard!');
  });
};

// == DASHBOARD STATS ==
function updateStats() {
  const total = works.length;
  const pending = works.filter(w => w.status === 'pending').length;
  const completed = works.filter(w => w.status === 'completed').length;
  const today = new Date(); today.setHours(0,0,0,0);
  const dueToday = works.filter(work => {
    if (!work.deadline) return false;
    const deadline = new Date(work.deadline); deadline.setHours(0,0,0,0);
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
