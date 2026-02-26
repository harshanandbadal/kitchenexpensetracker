// script.js

const API_BASE = 'https://backend-six-henna-16.vercel.app';

// ===================== Auth Helpers =====================
function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

function requireAuth() {
    if (!getToken()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// ===================== API Functions =====================
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers: authHeaders()
        });
        if (response.status === 401) {
            // Token expired or invalid
            logout();
            return null;
        }
        return response;
    } catch (err) {
        console.error('API request failed:', err);
        alert('Cannot connect to server. Please make sure the backend is running.');
        return null;
    }
}

async function fetchExpenses() {
    const res = await apiRequest('/api/expenses');
    if (res && res.ok) {
        return await res.json();
    }
    return [];
}

async function fetchUserProfile() {
    const res = await apiRequest('/api/auth/me');
    if (res && res.ok) {
        const data = await res.json();
        return data.user;
    }
    return null;
}

async function addExpense(expense) {
    const res = await apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(expense)
    });
    if (res && res.ok) {
        return await res.json();
    }
    if (res) {
        const data = await res.json();
        alert(data.error || 'Failed to add expense.');
    }
    return null;
}

async function deleteExpense(id) {
    const res = await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' });
    return res && res.ok;
}

async function clearAllData() {
    const res = await apiRequest('/api/expenses', { method: 'DELETE' });
    return res && res.ok;
}

async function setBudget(amount) {
    const res = await apiRequest('/api/budget/set', {
        method: 'PUT',
        body: JSON.stringify({ amount })
    });
    if (res && res.ok) {
        const data = await res.json();
        return data.totalBudget;
    }
    return null;
}

async function addMoneyToBudget(amount) {
    const res = await apiRequest('/api/budget/add', {
        method: 'PUT',
        body: JSON.stringify({ amount })
    });
    if (res && res.ok) {
        const data = await res.json();
        return data.totalBudget;
    }
    return null;
}

// ===================== Global State =====================
let totalBudget = 0;
let expenses = [];

// ===================== Display Functions =====================
function updateDisplay() {
    const budgetEl = document.getElementById('totalBudget');
    const spentEl = document.getElementById('totalSpent');
    const balanceEl = document.getElementById('balanceLeft');
    
    if (!budgetEl || !spentEl || !balanceEl) return; // Elements don't exist on this page
    
    budgetEl.textContent = '₹' + totalBudget.toFixed(2);
    const totalSpent = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    spentEl.textContent = '₹' + totalSpent.toFixed(2);
    const balanceLeft = totalBudget - totalSpent;
    balanceEl.textContent = '₹' + balanceLeft.toFixed(2);
    balanceEl.classList.toggle('negative', balanceLeft < 0);
    updateTable();
}

function updateTable() {
    const tbody = document.getElementById('expenseTableBody');
    if (!tbody) return; // Element doesn't exist on this page
    tbody.innerHTML = '';
    if (expenses.length === 0) {
        tbody.innerHTML = `<tr class="empty-state"><td colspan="7"><p>No expenses recorded yet</p><small>Add your first expense using the form above</small></td></tr>`;
        return;
    }
    // Sort expenses by date
    expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningBalance = totalBudget;
    expenses.forEach((exp) => {
        runningBalance -= parseFloat(exp.amount);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(exp.date)}</td>
            <td>${exp.item}</td>
            <td>₹${parseFloat(exp.amount).toFixed(2)}</td>
            <td>${exp.quantity}</td>
            <td>${exp.mode}</td>
            <td class="${runningBalance < 0 ? 'negative' : ''}">₹${runningBalance.toFixed(2)}</td>
            <td><button class="delete-btn" data-id="${exp._id}">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
}

function showUserInfo() {
    const user = getUser();
    const welcomeEl = document.getElementById('welcomeUser');
    if (user && welcomeEl) {
        welcomeEl.textContent = `Welcome, ${user.username}!`;
    }
}

// ===================== Load Data from Server =====================
async function loadData() {
    const user = await fetchUserProfile();
    if (user) {
        totalBudget = user.totalBudget || 0;
        // Update cached user info
        localStorage.setItem('user', JSON.stringify(user));
    }
    expenses = await fetchExpenses();
    updateDisplay();
}

// ===================== Event Listeners =====================
document.addEventListener('DOMContentLoaded', function() {
    if (!requireAuth()) return;

    showUserInfo();
    loadData();
    setDefaultDate();
});

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        logout();
    });
}

// Form submission - Add expense
const expenseForm = document.getElementById('expenseForm');
if (expenseForm) {
    expenseForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const date = document.getElementById('date').value;
        const item = document.getElementById('item').value.trim();
        const quantity = document.getElementById('quantity').value.trim();
        const amount = document.getElementById('amount').value;
        const mode = document.getElementById('mode').value;

        if (!date || !item || !quantity || !amount || !mode) {
            alert('Please fill in all fields.');
            return;
        }

        const newExpense = await addExpense({ date, item, amount: parseFloat(amount), quantity, mode });
        if (newExpense) {
            expenses.push(newExpense);
            updateDisplay();
            this.reset();
            setDefaultDate();
            document.getElementById('item').focus();
        }
    });
}

// Delete expense
const expenseTableBody = document.getElementById('expenseTableBody');
if (expenseTableBody) {
    expenseTableBody.addEventListener('click', async function(e) {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.getAttribute('data-id');
            if (await deleteExpense(id)) {
                expenses = expenses.filter(exp => exp._id !== id);
                updateDisplay();
            }
        }
    });
}

// Set budget
const setBudgetBtn = document.getElementById('set-budget');
if (setBudgetBtn) {
    setBudgetBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        const budget = prompt('Enter monthly budget amount (₹):');
        if (budget !== null && !isNaN(parseFloat(budget)) && parseFloat(budget) >= 0) {
            const newBudget = await setBudget(parseFloat(budget));
            if (newBudget !== null) {
                totalBudget = newBudget;
                updateDisplay();
            }
        } else if (budget !== null) {
            alert('Please enter a valid positive number.');
        }
    });
}

// Add money to budget
const addMoneyBtn = document.getElementById('add-money');
if (addMoneyBtn) {
    addMoneyBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        const addAmount = prompt('Enter amount to add to budget (₹):');
        if (addAmount !== null && !isNaN(parseFloat(addAmount)) && parseFloat(addAmount) > 0) {
            const newBudget = await addMoneyToBudget(parseFloat(addAmount));
            if (newBudget !== null) {
                totalBudget = newBudget;
                updateDisplay();
            }
        } else if (addAmount !== null) {
            alert('Please enter a valid positive number.');
        }
    });
}

// Clear all data
const clearDataBtn = document.getElementById('clear-data');
if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            if (await clearAllData()) {
                totalBudget = 0;
                expenses = [];
                updateDisplay();
            }
        }
    });
}

// Print statement
const printStatementBtn = document.getElementById('print-statement');
if (printStatementBtn) {
    printStatementBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = 'print-statement.html';
    });
}
