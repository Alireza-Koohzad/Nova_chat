import React from 'react';
import './Header.css'; // استایل‌های هدر

function Header({ user, onLogout }) {
    return (
        <header className="app-header">
            <div className="header-logo">NovaChat</div>
            <div className="header-user-info">
                <span className="user-display-name">Welcome, {user.displayName || user.username}</span>
                <button onClick={onLogout} className="logout-button">
                    Logout
                </button>
            </div>
        </header>
    );
}

export default Header;