/**
 * Logi Credit Dashboard Logic
 * Rewritten to match specific HTML IDs and Server API requirements
 */

// --- Formatters ---
const currencyFormatter = new Intl.NumberFormat('hu-HU', {
  style: 'currency',
  currency: 'HUF',
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

// --- State Management ---
let allUsers = [];     // Stores { username, email, name, ... } for filtered search
let currentUserId = null; // Stores Logged-in User ID (MongoDB _id)

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize User & Data
    await initializeUser();
    await fetchUsers();        // For Autocomplete
    await fetchTransactions(); // For Table & Chart
    
    // 2. Setup Event Listeners
    setupModalEvents();
    setupAutocomplete();
    setupTransferForm();
});

// --- API Functions ---

async function initializeUser() {
    const token = localStorage.getItem('authToken');
    if (!token) return; // Normally app.js handles redirection

    try {
        const response = await fetch('/api/user/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.user) {
                currentUserId = data.user._id;
                // Update UI Name
                const nameEl = document.getElementById('user-name');
                if (nameEl) nameEl.textContent = data.user.name || data.user.username;
                
                // Update UI Balance
                const balanceEl = document.getElementById('user-balance');
                if (balanceEl) {
                    const balance = data.user.balance || 0;
                    balanceEl.textContent = balance.toLocaleString('hu-HU');
                }
            }
        }
    } catch (error) {
        console.error('Failed to init user:', error);
    }
}

async function fetchUsers() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        // Handle array or wrapped object structure
        if (Array.isArray(data)) {
            allUsers = data;
        } else if (data.users && Array.isArray(data.users)) {
            allUsers = data.users;
        }
    } catch (error) {
        console.error('Failed to load users for search:', error);
    }
}

async function fetchTransactions() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch('/api/transactions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.transactions)) {
            renderTransactions(data.transactions);
            updateSummary(data.transactions);
            renderChart(data.transactions);
        }
    } catch (error) {
        console.error('Failed to load transactions:', error);
    }
}

// --- Rendering Logic ---

function renderTransactions(transactions) {
    const tbody = document.getElementById('transaction-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: #718096;">Nincs megjeleníthető tranzakció</td></tr>';
        return;
    }

    // Sort by Date Descending
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    transactions.forEach(tx => {
        const tr = document.createElement('tr');

        // Determine Direction
        // If I am fromUser -> Outgoing (-)
        // If I am toUser   -> Incoming (+)
        const isOutgoing = tx.fromUser._id === currentUserId;
        
        // Partner Name logic
        const partner = isOutgoing ? tx.toUser : tx.fromUser;
        const partnerName = partner ? (partner.name || partner.username || partner.email) : 'Ismeretlen';

        // Styles & Formatting
        const amountClass = isOutgoing ? 'text-red-600' : 'text-green-600'; 
        const amountColor = isOutgoing ? '#e53e3e' : '#38a169';
        const prefix = isOutgoing ? '-' : '+';
        const formattedDate = dateFormatter.format(new Date(tx.createdAt));
        const formattedAmount = `${prefix}${currencyFormatter.format(tx.amount)}`;
        const noteText = tx.note || 'Tranzakció';

        // Short ID
        const shortId = tx._id.substring(tx._id.length - 8).toUpperCase();

        tr.innerHTML = `
            <td><code style="color: #718096; font-size: 0.9em;">${shortId}</code></td>
            <td>
                <div style="font-weight: 500; color: #2d3748;">${partnerName}</div>
                <div style="font-size: 12px; color: #718096;">${noteText}</div>
            </td>
            <td>${formattedDate}</td>
            <td style="font-weight: 700; color: ${amountColor};">${formattedAmount}</td>
            <td><span class="status-badge status-ok">Sikeres</span></td>
        `;

        tbody.appendChild(tr);
    });
}

function updateSummary(transactions) {
    // Basic summary update - calculates total user volume
    const totalEl = document.getElementById('summary-total-volume');
    if (!totalEl) return;

    let totalVolume = 0;
    // Calculate total money moved involved with user
    transactions.forEach(tx => totalVolume += tx.amount);
    
    totalEl.textContent = currencyFormatter.format(totalVolume);
}

// --- UI Interaction & Modal ---

function setupModalEvents() {
    const modal = document.getElementById('transfer-modal');
    const openBtn = document.getElementById('new-transfer-btn'); // ID from requirements
    // Class from requirements (.close-modal AND .close-modal-btn just in case)
    const closeBtns = document.querySelectorAll('.close-modal, .close-modal-btn'); 

    if (openBtn && modal) {
        openBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            clearError();
            // Focus on search input
            const search = document.getElementById('recipient-search');
            if (search) search.focus();
        });
    }

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => closeModal());
    });

    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

function closeModal() {
    const modal = document.getElementById('transfer-modal');
    if (modal) modal.style.display = 'none';
    clearError();
    // Optional: Reset form fields
    const form = document.querySelector('form'); // Or #transfer-form
    if (form) form.reset();
}

function setupAutocomplete() {
    const input = document.getElementById('recipient-search');
    const resultsBox = document.getElementById('recipient-autocomplete'); // ID from requirements

    if (!input || !resultsBox) return;

    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        
        if (val.length < 1) {
            resultsBox.style.display = 'none';
            return;
        }

        // Filter valid users (exclude self)
        const matches = allUsers.filter(u => {
            if (u._id === currentUserId) return false;
            const uName = (u.username || '').toLowerCase();
            const uEmail = (u.email || '').toLowerCase();
            const uRealName = (u.name || '').toLowerCase();
            return uName.includes(val) || uEmail.includes(val) || uRealName.includes(val);
        });

        if (matches.length > 0) {
            resultsBox.innerHTML = '';
            matches.forEach(u => {
                const div = document.createElement('div');
                // Styling for suggestion item
                div.style.padding = '10px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #f0f0f0';
                div.innerHTML = `
                    <div style="font-weight:600">${u.username}</div>
                    <div style="font-size:12px; color:#666">${u.email}</div>
                `;
                
                div.addEventListener('click', () => {
                    input.value = u.username; // Set Input to Username
                    resultsBox.style.display = 'none';
                });

                div.addEventListener('mouseenter', () => div.style.backgroundColor = '#f7fafc');
                div.addEventListener('mouseleave', () => div.style.backgroundColor = 'transparent');

                resultsBox.appendChild(div);
            });
            resultsBox.style.display = 'block';
        } else {
            resultsBox.style.display = 'none';
        }
    });

    // Hide if clicked outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
            resultsBox.style.display = 'none';
        }
    });
}

function setupTransferForm() {
    // Find the form within the modal or generic form
    const form = document.querySelector('#transfer-modal form') || document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        // Gather Data
        const recipientInput = document.getElementById('recipient-search');
        const amountInput = document.getElementById('amount'); // Standard ID assumption
        const noteInput = document.getElementById('note');     // Standard ID assumption

        const recipient = recipientInput ? recipientInput.value.trim() : '';
        const amount = amountInput ? parseInt(amountInput.value) : 0;
        const note = noteInput ? noteInput.value.trim() : '';

        // Validation
        if (!recipient) {
            showError('Kérjük válassz kedvezményezettet!');
            return;
        }
        if (!amount || amount <= 0) {
            showError('Kérjük adj meg érvényes összeget!');
            return;
        }

        // --- SUBMIT LOGIC ---
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Küldés...';
        }

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('/api/transactions/transfer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    to: recipient, // Sending username/email string
                    amount: amount,
                    note: note
                })
            });

            const result = await res.json();

            if (res.ok && result.success) {
                // Success
                closeModal();
                await fetchTransactions(); // Refresh List
                await initializeUser(); // Refresh balance
            } else {
                showError(result.message || 'Hiba történt az utalás során.');
            }

        } catch (err) {
            console.error(err);
            showError('Hálózati hiba. Kérjük próbáld újra.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Utalás';
            }
        }
    });
}

function showError(msg) {
    const errDiv = document.getElementById('transfer-error'); // ID from requirements
    if (errDiv) {
        errDiv.textContent = msg;
        errDiv.style.display = 'block';
        errDiv.style.color = '#c53030';
        errDiv.style.backgroundColor = '#fff5f5';
        errDiv.style.padding = '10px';
        errDiv.style.borderRadius = '6px';
        errDiv.style.marginBottom = '16px';
    } else {
        alert(msg); // Fallback
    }
}

function clearError() {
    const errDiv = document.getElementById('transfer-error');
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
}

// --- Chart ---
function renderChart(transactions) {
    const canvas = document.getElementById('volumeChart');
    // Check if Chart.js is loaded
    if (!canvas || typeof Chart === 'undefined') return;

    // Prepare data: Aggregate by Date (last 7 days)
    const dailyVolume = {};
    const today = new Date();
    
    // Initialize last 7 days with 0
    for(let i=6; i>=0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyVolume[key] = 0;
    }

    // Fill data
    transactions.forEach(tx => {
        const dateKey = new Date(tx.createdAt).toISOString().split('T')[0];
        if (dailyVolume[dateKey] !== undefined) {
             dailyVolume[dateKey] += tx.amount;
        }
    });

    // Formatting for Chart
    const labels = Object.keys(dailyVolume).map(d => 
        new Date(d).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
    );
    const dataPoints = Object.values(dailyVolume);

    // If chart instance exists, destroy it (rudimentary check, or just overwrite)
    // Note: In a real app we'd track the instance globally to destroy it properly.
    // For now assuming full page reload per best practice on this dashboard.

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Forgalom (HUF)',
                data: dataPoints,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}
