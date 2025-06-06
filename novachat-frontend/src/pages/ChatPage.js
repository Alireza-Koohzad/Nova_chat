import React from 'react';
import { useAuth } from '../contexts/AuthContext';

function ChatPage() {
    const { user, logout } = useAuth();

    const handleLogout = () => {
        logout();
        // navigate('/login'); // AuthContext باید خودش این کار را انجام دهد یا App.js ریدایرکت کند
    };

    if (!user) {
        return <p>Loading user...</p>; // این حالت نباید زیاد اتفاق بیفتد اگر PrivateRoute درست کار کند
    }

    return (
        <div>
            <h1>Welcome to NovaChat, {user.displayName || user.username}!</h1>
            <p>Your User ID: {user.id}</p>
            <p>Your Email: {user.email}</p>
            <button onClick={handleLogout}>Logout</button>
            <hr/>
            <p>(Chat interface will be here in the next phase)</p>
        </div>
    );
}

export default ChatPage;