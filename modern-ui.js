// Modern UI Enhancements for Work Management App

// == ENHANCED STATUS CHANGE POPOVER - FIXED Z-INDEX (PORTAL) ==
function showModernStatusModal(workId, currentStatus, buttonElement) {
    // Check if this popover is already open
    const existingPopover = document.querySelector(`.status-popover[data-work-id="${workId}"]`);

    // Remove all existing popovers first
    document.querySelectorAll('.status-popover').forEach(popover => popover.remove());

    // Stop propagation to prevent immediate closing logic from interfering
    if (event) event.stopPropagation();

    // If it was already open for this work item, we simply return (toggled off)
    if (existingPopover) return;

    const work = works.find(w => w.id === workId);
    if (!work) return;

    const statusOptions = [
        {
            value: 'Pending',
            icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
            color: '#fb923c',
            bg: '#fff7ed'
        },
        {
            value: 'In Progress',
            icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>',
            color: '#3b82f6',
            bg: '#eff6ff'
        },
        {
            value: 'Proof',
            icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>',
            color: '#a855f7',
            bg: '#faf5ff'
        },
        {
            value: 'Unpaid',
            icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
            color: '#ef4444',
            bg: '#fef2f2'
        },
        {
            value: 'Completed',
            icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
            color: '#22c55e',
            bg: '#f0fdf4'
        }
    ];

    const popover = document.createElement('div');
    popover.className = 'status-popover';
    popover.setAttribute('data-work-id', workId); // Mark for toggle check
    popover.innerHTML = `
        <div class="status-options-container">
            ${statusOptions.map(option => `
                <div class="status-option-modern ${option.value === currentStatus ? 'current' : ''}"
                     onclick="handleStatusChange(${workId}, '${option.value}', this)"
                     data-status="${option.value}">
                    <div class="status-icon-modern" style="background: ${option.bg}; color: ${option.color}">
                        ${option.icon}
                    </div>
                    <div class="status-details">
                        <div class="status-label">${option.value}</div>
                    </div>
                    ${option.value === currentStatus ?
            '<svg class="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>'
            : ''}
                </div>
            `).join('')}
        </div>
    `;

    // Append to body to escape stacking contexts (Portal pattern)
    document.body.appendChild(popover);

    // Position relatively to the button
    if (buttonElement) {
        const rect = buttonElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        // Default position: below the button, aligned left
        let top = rect.bottom + scrollTop + 8;
        let left = rect.left + scrollLeft;

        // Check if fits in viewport width, if not adjust left
        if (left + 240 > window.innerWidth) { // 240 is min-width
            left = window.innerWidth - 250;
        }

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
        popover.style.zIndex = '99999'; // Ensure it's on top of everything
    }

    // Close when clicking outside
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!popover.contains(e.target) && (!buttonElement || !buttonElement.contains(e.target))) {
                popover.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 100);
}

// == HANDLE STATUS CHANGE WITH LOADING ==
async function handleStatusChange(workId, newStatus, element) {
    if (statusUpdateInProgress.has(workId)) return;

    // Show loading
    showLoadingOverlay('Updating status...');

    // Close popover
    document.querySelectorAll('.status-popover').forEach(popover => popover.remove());

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

        // Update UI
        renderWorks();
        updateStats();
        updateMemberTiles();
        updateRecentActivity();

        hideLoadingOverlay();
        showNotification(`Status updated to ${newStatus}`, 'success');

        const work = works.find(w => w.id === workId);
        if (work) {
            showBrowserNotification('Status Updated', {
                body: `"${work.work_name}" is now ${newStatus}`,
                tag: 'status-change'
            });
        }

    } catch (error) {
        console.error('Error updating work status:', error);
        hideLoadingOverlay();
        showNotification('Failed to update status', 'error');
        await refreshWorks();
    } finally {
        statusUpdateInProgress.delete(workId);
    }
}

// == LOADING OVERLAY ==
function showLoadingOverlay(message = 'Loading...') {
    // Remove existing overlay
    hideLoadingOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-content">
            <div class="modern-spinner"></div>
            <div class="loading-text">${message}</div>
        </div>
    `;

    document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 200);
    }
}

// == SIMPLIFIED TIME SELECTION ==
const TIME_OPTIONS = [
    { label: '9:00 AM', value: '09:00' },
    { label: '9:30 AM', value: '09:30' },
    { label: '10:00 AM', value: '10:00' },
    { label: '10:30 AM', value: '10:30' },
    { label: '11:00 AM', value: '11:00' },
    { label: '11:30 AM', value: '11:30' },
    { label: '12:00 PM', value: '12:00' },
    { label: '12:30 PM', value: '12:30' },
    { label: '1:00 PM', value: '13:00' },
    { label: '1:30 PM', value: '13:30' },
    { label: '2:00 PM', value: '14:00' },
    { label: '2:30 PM', value: '14:30' },
    { label: '3:00 PM', value: '15:00' },
    { label: '3:30 PM', value: '15:30' },
    { label: '4:00 PM', value: '16:00' },
    { label: '4:30 PM', value: '16:30' },
    { label: '5:00 PM', value: '17:00' },
    { label: '5:30 PM', value: '17:30' },
    { label: '6:00 PM', value: '18:00' },
    { label: '6:30 PM', value: '18:30' }
];

function selectTimeOption(value, containerId) {
    // Get the container - could be the grid itself or parent
    let container = document.getElementById(containerId);
    if (!container) return;

    // If container is the grid, use it; otherwise find the grid inside
    const grid = container.classList.contains('time-grid') ? container : container.querySelector('.time-grid');
    if (!grid) container = grid || container;

    // Identify search container (the grid or flex container)
    const searchContainer = grid || container;

    // Check if the clicked option is ALREADY selected
    const targetOption = searchContainer.querySelector(`[data-value="${value}"]`);
    const isAlreadySelected = targetOption && targetOption.classList.contains('selected');

    // Deselect all options first
    searchContainer.querySelectorAll('.time-option').forEach(option => {
        option.classList.remove('selected');
    });

    // Locate the hidden input to update value
    const parentContainer = grid ? grid.closest('.time-select-simple')?.parentElement : container.parentElement;
    const hiddenInput = parentContainer?.querySelector('input[type="hidden"]');

    if (isAlreadySelected) {
        // If it was selected, we leave it deselected (toggle off)
        if (hiddenInput) hiddenInput.value = '';
    } else {
        // If it was NOT selected, select it now
        if (targetOption) targetOption.classList.add('selected');
        if (hiddenInput) hiddenInput.value = value;
    }
}

// == ENHANCED FORM SUBMISSION WITH LOADING ==
async function handleWorkSubmit(formId, callback, successMessage) {
    const form = document.getElementById(formId);
    if (!form) return;

    const submitButton = form.querySelector('[type="submit"]');
    if (!submitButton) return;

    // Add loading state to button
    submitButton.classList.add('btn-loading');
    submitButton.disabled = true;

    try {
        await callback();
        showNotification(successMessage, 'success');
    } catch (error) {
        console.error('Form submission error:', error);
        showNotification('Operation failed', 'error');
    } finally {
        submitButton.classList.remove('btn-loading');
        submitButton.disabled = false;
    }
}

// Export functions for global use
if (typeof window !== 'undefined') {
    window.showModernStatusModal = showModernStatusModal;
    window.handleStatusChange = handleStatusChange;
    window.showLoadingOverlay = showLoadingOverlay;
    window.hideLoadingOverlay = hideLoadingOverlay;
    window.selectTimeOption = selectTimeOption;
    window.handleWorkSubmit = handleWorkSubmit;
}

// == DRAG SCROLL FUNCTIONALITY ==
function enableDragScroll(container) {
    if (!container) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    container.addEventListener('mousedown', (e) => {
        isDown = true;
        container.style.cursor = 'grabbing';
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
    });

    container.addEventListener('mouseleave', () => {
        isDown = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mouseup', () => {
        isDown = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 2; // Scroll fast
        container.scrollLeft = scrollLeft - walk;
    });

    // Set initial cursor
    container.style.cursor = 'grab';
}

// Initialize drag scroll for relevant containers
document.addEventListener('DOMContentLoaded', () => {
    const scrollContainers = [
        'workDeadlineTimeContainer',
        'editWorkDeadlineTimeContainer'
    ];

    scrollContainers.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            enableDragScroll(element);
        }
    });
});
