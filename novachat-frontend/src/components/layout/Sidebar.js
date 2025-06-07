import React, { useState, useEffect } from 'react';
import chatServiceAPI from '../../services/chatServiceAPI';
import { useAuth } from '../../contexts/AuthContext';
import UserSearch from '../chat/UserSearch';
import { UsersIcon } from '../icons'; // یک آیکون برای گروه
import './Sidebar.css';

function Sidebar({ chats, setChats, onSelectChat, currentUser, userStatuses, selectedChatId }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchChats = async () => {
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const fetchedChats = await chatServiceAPI.getUserChats(token);
                // مرتب سازی چت ها بر اساس آخرین فعالیت (updatedAt یا lastMessage.createdAt)
                const sortedChats = (fetchedChats || []).sort((a, b) => {
                    const dateA = new Date(a.lastMessage?.createdAt || a.updatedAt || 0);
                    const dateB = new Date(b.lastMessage?.createdAt || b.updatedAt || 0);
                    return dateB - dateA;
                });
                setChats(sortedChats);
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
    }, [token, setChats]);

    const getChatDisplayInfo = (chat) => {
        if (chat.type === 'private') {
            const otherMember = chat.members?.find(m => m.id !== currentUser.id);
            return {
                name: otherMember?.displayName || otherMember?.username || 'User',
                recipientId: otherMember?.id,
                avatarInitial: (otherMember?.displayName || otherMember?.username || 'U').substring(0, 1).toUpperCase(),
                isGroup: false,
                profileImageUrl: otherMember?.profileImageUrl // اضافه شد برای آواتار
            };
        } else if (chat.type === 'group') {
            return {
                name: chat.name || 'Group Chat',
                recipientId: null,
                avatarInitial: null, // برای گروه از آیکون استفاده می کنیم
                isGroup: true,
                memberCount: chat.members?.length || 0,
                // groupImageUrl: chat.groupImageUrl // اگر دارید
            };
        }
        return { name: 'Unknown Chat', avatarInitial: '?', isGroup: false, profileImageUrl: null };
    };

    const addOrUpdateChatInList = (newOrUpdatedChat) => {
        setChats(prevChats => {
            const existingChatIndex = prevChats.findIndex(c => c.id === newOrUpdatedChat.id);
            let newChatsArray;
            if (existingChatIndex > -1) {
                newChatsArray = [...prevChats];
                newChatsArray[existingChatIndex] = { ...prevChats[existingChatIndex], ...newOrUpdatedChat };
            } else {
                newChatsArray = [newOrUpdatedChat, ...prevChats];
            }
            // مرتب سازی مجدد
            return newChatsArray.sort((a, b) => {
                const dateA = new Date(a.lastMessage?.createdAt || a.updatedAt || 0);
                const dateB = new Date(b.lastMessage?.createdAt || b.updatedAt || 0);
                return dateB - dateA;
            });
        });
    };

    if (loading) return <div className="sidebar-status-message">Loading chats...</div>;
    if (error) return <div className="sidebar-status-message error">Error: {error} <button onClick={() => window.location.reload()} className="retry-button">Retry</button></div>;

    return (
        <aside className="sidebar-container">
            <div className="sidebar-header">
                <UserSearch
                    currentUser={currentUser}
                    onChatStartedOrSelected={(chat) => {
                        addOrUpdateChatInList(chat);
                        onSelectChat(chat);
                    }}
                />
            </div>
            <ul className="chat-list">
                {chats.length === 0 && !loading && <li className="no-chats-message">No active chats. Start a new one!</li>}
                {chats.map((chat) => {
                    const displayInfo = getChatDisplayInfo(chat);
                    const recipientOnlineStatus = !displayInfo.isGroup && displayInfo.recipientId ? userStatuses[displayInfo.recipientId]?.status === 'online' : false;
                    const isActive = chat.id === selectedChatId;

                    return (
                        <li
                            key={chat.id}
                            onClick={() => onSelectChat(chat)}
                            className={`chat-list-item ${isActive ? 'active' : ''}`}
                            title={displayInfo.name}
                        >
                            <div className="chat-item-avatar-wrapper">
                                <div
                                    className="chat-item-avatar"
                                    style={{
                                        backgroundColor: displayInfo.isGroup ? '#00796b' : (displayInfo.profileImageUrl ? 'transparent' : '#bdbdbd')
                                    }}
                                >
                                    {displayInfo.isGroup ? <UsersIcon /> :
                                        (displayInfo.profileImageUrl ? <img src={displayInfo.profileImageUrl} alt={displayInfo.name.substring(0,1)} /> : displayInfo.avatarInitial)
                                    }
                                </div>
                                {recipientOnlineStatus && <span className="status-dot online"></span>}
                            </div>
                            <div className="chat-item-info">
                                <span className="chat-name">{displayInfo.name}</span>
                                {displayInfo.isGroup && displayInfo.memberCount > 0 && (
                                    <span className="member-count">{displayInfo.memberCount} members</span>
                                )}
                                {chat.lastMessage && (
                                    <p className="last-message-preview">
                                        {chat.lastMessage.senderId === currentUser.id ? <span className="last-message-prefix">You: </span> : ""}
                                        {chat.lastMessage.contentType === 'system' ?
                                            <em>{chat.lastMessage.content?.substring(0, 25)}</em> :
                                            chat.lastMessage.content?.substring(0, 25)
                                        }
                                        {(chat.lastMessage.contentType === 'image' && !chat.lastMessage.content) && <em>[Image]</em>}
                                        {(chat.lastMessage.content?.length > 25 || (chat.lastMessage.contentType === 'image' && !chat.lastMessage.content)) ? "..." : ""}
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