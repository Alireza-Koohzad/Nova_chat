// js/auth.js
const API_BASE_URL = 'http://localhost:3000/api'; // آدرس بک‌اند خود را وارد کنید

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutButton = document.getElementById('logoutButton');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // اگر کاربر لاگین کرده و در صفحه لاگین یا رجیستر است، به صفحه اصلی هدایت کن
    // این برای زمانی است که کاربر دستی به این صفحات برود
    if ( (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html')) && localStorage.getItem('authToken')) {
        window.location.href = 'index.html';
    }

    // اگر کاربر لاگین نکرده و در صفحه اصلی است، به صفحه لاگین هدایت کن
    if (window.location.pathname.includes('index.html') && !localStorage.getItem('authToken')) {
        window.location.href = 'login.html';
    }
});

async function handleLogin(event) {
    event.preventDefault();
    const loginInput = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    const errorMessageElement = document.getElementById('loginError');
    errorMessageElement.textContent = '';

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginInput, password })
        });
        const data = await response.json();
        if (data.success && data.token) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            window.location.href = 'index.html'; // هدایت به صفحه اصلی
        } else {
            errorMessageElement.textContent = data.message || 'Login failed. Please check your credentials.';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessageElement.textContent = 'An error occurred. Please try again.';
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const displayName = document.getElementById('displayName').value;
    const errorMessageElement = document.getElementById('registerError');
    errorMessageElement.textContent = '';
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, displayName: displayName || username })
        });
        const data = await response.json();
        if (data.success && data.token) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            window.location.href = 'index.html'; // هدایت به صفحه اصلی
        } else {
            let msg = data.message || 'Registration failed.';
            if (data.errors && data.errors.length > 0) {
                msg = data.errors.map(err => err.msg).join(', ');
            }
            errorMessageElement.textContent = msg;
        }
    } catch (error) {
        console.error('Registration error:', error);
        errorMessageElement.textContent = 'An error occurred during registration.';
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    // اگر از socket استفاده می‌کنید، باید آن را disconnect کنید
    if (window.socket && window.socket.connected) {
        window.socket.disconnect();
    }
    window.location.href = 'login.html';
}

function getAuthToken() {
    return localStorage.getItem('authToken');
}

function getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}