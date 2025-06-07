import React, {useState, useEffect} from 'react';
import chatServiceAPI from '../../services/chatServiceAPI';
import {useAuth} from '../../contexts/AuthContext';
import UserSearch from '../chat/UserSearch'; // برای جستجو و شروع چت جدید
import './Sidebar.css';

function Sidebar({chats, setChats, onSelectChat, currentUser, userStatuses, selectedChatId}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const {token} = useAuth();

    useEffect(() => {
        const fetchChats = async () => {
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const fetchedChats = await chatServiceAPI.getUserChats(token);
                setChats(fetchedChats || []);
                setError(null);
            } catch (err) {
                console.error("Failed to fetch chats:", err);
                setError(err.message || "Could not load chats.");
                setChats([]);
            } finally {
                setLoading(false);
            }
        };

        fetchChats();
    }, [token, setChats]); // setChats را به وابستگی‌ها اضافه می‌کنیم

    const getChatDisplayInfo = (chat) => {
        if (chat.type === 'private') {
            const otherMember = chat.members?.find(m => m.id !== currentUser.id);
            return {
                name: otherMember?.displayName || otherMember?.username || 'User',
                recipientId: otherMember?.id,
                avatarInitial: (otherMember?.displayName || otherMember?.username || 'U').substring(0, 1).toUpperCase(),
                isGroup: false,
            };
        } else if (chat.type === 'group') {
            return {
                name: chat.name || 'Group Chat',
                recipientId: null, // برای گروه، recipientId خاصی وجود ندارد
                avatarInitial: (chat.name || 'G').substring(0, 1).toUpperCase(),
                isGroup: true,
                memberCount: chat.members?.length || 0
            };
        }
        // پیش فرض اگر نوع چت مشخص نباشد (نباید اتفاق بیفتد)
        return { name: 'Unknown Chat', avatarInitial: '?', isGroup: false };
    };

    // تابع برای اضافه یا آپدیت کردن یک چت در لیست (مثلا پس از شروع چت جدید)
    const addOrUpdateChatInList = (newOrUpdatedChat) => {
        setChats(prevChats => {
            const existingChatIndex = prevChats.findIndex(c => c.id === newOrUpdatedChat.id);
            if (existingChatIndex > -1) {
                // آپدیت چت موجود
                const updatedChats = [...prevChats];
                updatedChats[existingChatIndex] = {...prevChats[existingChatIndex], ...newOrUpdatedChat};
                // انتقال به بالا اگر لازم است (بر اساس آخرین پیام)
                updatedChats.sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt) - new Date(a.lastMessage?.createdAt || a.updatedAt));
                return updatedChats;
            } else {
                // اضافه کردن چت جدید به ابتدا
                return [newOrUpdatedChat, ...prevChats];
            }
        });
    };




    if (loading) return <div className="sidebar-status-message">Loading chats...</div>;
    if (error) return <div className="sidebar-status-message error">Error: {error}
        <button onClick={() => window.location.reload()}>Retry</button>
    </div>;

    return (
        <aside className="sidebar-container">
            <div className="sidebar-header">
                <UserSearch
                    currentUser={currentUser}
                    onChatStartedOrSelected={(chat) => {
                        addOrUpdateChatInList(chat);
                        onSelectChat(chat); // مستقیم چت جدید را انتخاب کن
                    }}
                />
            </div>
            <ul className="chat-list">
                {chats.length === 0 && !loading &&
                    <li className="no-chats-message">No active chats. Start a new one!</li>}
                {chats.map((chat) => {
                    const displayInfo = getChatDisplayInfo(chat);
                    const recipientStatus = displayInfo.recipientId ? userStatuses[displayInfo.recipientId]?.status : null;
                    const isActive = chat.id === selectedChatId;

                    return (
                        <li
                            key={chat.id}
                            onClick={() => onSelectChat(chat)}
                            className={`chat-list-item ${isActive ? 'active' : ''}`}
                            title={displayInfo.name}
                        >
                            <div className="chat-item-avatar-wrapper">
                                <div className="chat-item-avatar">
                                    {displayInfo.avatarInitial}
                                </div>
                                {recipientStatus === 'online' && <span className="status-dot online"></span>}
                            </div>
                            <div className="chat-item-info">
                                <span className="chat-name">{displayInfo.name}</span>
                                {chat.lastMessage && (
                                    <p className="last-message-preview">
                                        {chat.lastMessage.senderId === currentUser.id ? "You: " : ""}
                                        {chat.lastMessage.content?.substring(0, 20) || (chat.lastMessage.contentType !== 'text' ? `[${chat.lastMessage.contentType}]` : '')}
                                        {chat.lastMessage.content?.length > 20 ? "..." : ""}
                                    </p>
                                )}
                            </div>
                            {chat.unreadCount > 0 && <span className="unread-badge">{chat.unreadCount}</span>}
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}

export default Sidebar;