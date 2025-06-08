import React, {useState, useCallback} from 'react';
import chatServiceAPI from '../../services/chatServiceAPI';
import {useAuth} from '../../contexts/AuthContext';
import './UserSearch.css'; // استایل

function UserSearch({currentUser, onChatStartedOrSelected}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const {token} = useAuth();

    // Debounce search function
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    const handleSearch = useCallback(
        debounce(async (query) => {
            if (query.length < 2) {
                setSearchResults([]);
                setError('');
                return;
            }
            setIsLoading(true);
            setError('');
            try {
                const users = await chatServiceAPI.searchUsers(query, token);
                setSearchResults(users.filter(u => u.id !== currentUser.id)); // خود کاربر را از نتایج حذف کن
            } catch (err) {
                console.error("Search error:", err);
                setError("Failed to search users.");
                setSearchResults([]);
            }
            setIsLoading(false);
        }, 500), // 500ms delay
        [token, currentUser.id]
    );

    const handleInputChange = (e) => {
        const query = e.target.value;
        setSearchTerm(query);
        handleSearch(query);
    };

    const handleSelectUser = async (selectedUser) => {
        setSearchTerm(''); // پاک کردن جستجو
        setSearchResults([]); // پاک کردن نتایج
        setIsLoading(true);
        try {
            const chat = await chatServiceAPI.createOrGetPrivateChat(selectedUser.id, token);
            onChatStartedOrSelected(chat); // به والد اطلاع بده تا چت را انتخاب و به لیست اضافه کند
        } catch (err) {
            console.error("Error starting chat:", err);
            alert(err.message || "Could not start chat."); // یا نمایش خطا به روشی بهتر
        }
        setIsLoading(false);
    };

    return (
        <div className="user-search-container">
            <input
                type="text"
                placeholder="Search users to chat..."
                value={searchTerm}
                onChange={handleInputChange}
                className="user-search-input"
            />
            {isLoading && <div className="search-status-message">Searching...</div>}
            {error && <div className="search-status-message error">{error}</div>}
            {searchResults.length > 0 && (
                <ul className="search-results-list">
                    {searchResults.map(user => (
                        <li key={user.id} onClick={() => handleSelectUser(user)} className="search-result-item">
                            {user.displayName || user.username}
                            <small> (@{user.username})</small>
                        </li>
                    ))}
                </ul>
            )}
            {searchTerm.length > 1 && searchResults.length === 0 && !isLoading && !error && (
                <div className="search-status-message">No users found.</div>
            )}
        </div>
    );
}

export default UserSearch;