import React from 'react';
import './ChatWindow.css';

function ChatWindow({selectedChat, currentUser, userStatuses}) {
    if (!selectedChat) {
        return (
            <div className="chat-window-placeholder">
                <p>Select a chat from the list</p>
                <p>or search to start a new conversation.</p>
            </div>
        );
    }

    const getChatDisplayInfo = () => {
        if (selectedChat.type === 'private' && selectedChat.members) {
            const otherMember = selectedChat.members.find(m => m.id !== currentUser.id);
            return {
                name: otherMember?.displayName || otherMember?.username || 'User',
                recipientId: otherMember?.id
            };
        }
        return {name: selectedChat.name || 'Group Chat', recipientId: null};
    };

    const displayInfo = getChatDisplayInfo();
    const recipientStatusInfo = displayInfo.recipientId ? userStatuses[displayInfo.recipientId] : null;

    let statusText = '';
    if (recipientStatusInfo) {
        statusText = recipientStatusInfo.status;
        if (recipientStatusInfo.status === 'offline' && recipientStatusInfo.lastSeenAt) {
            const lastSeenDate = new Date(recipientStatusInfo.lastSeenAt);
            // فرمت کردن تاریخ برای نمایش (می‌توانید از کتابخانه date-fns یا moment استفاده کنید)
            statusText += ` (last seen: ${lastSeenDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })} ${lastSeenDate.toLocaleDateString() === new Date().toLocaleDateString() ? '' : 'on ' + lastSeenDate.toLocaleDateString()} )`;
        }
    }


    return (
        <main className="chat-window-container">
            <header className="chat-window-header">
                <div className="chat-header-info">
                    {/* اینجا می‌توانید آواتار کاربر را هم نمایش دهید */}
                    <h3>{displayInfo.name}</h3>
                    {statusText && (
                        <span className={`chat-status-text ${recipientStatusInfo?.status}`}>
                {statusText}
            </span>
                    )}
                </div>
                {/* دکمه‌ها یا منوهای دیگر برای هدر چت */}
            </header>
            <div className="messages-list-area">
                {/* MessageList کامپوننت اینجا خواهد آمد */}
                <p style={{textAlign: 'center', marginTop: '20px', color: '#777'}}>Messages will appear here.</p>
            </div>
            <div className="message-input-area-placeholder">
                {/* MessageInput کامپوننت اینجا خواهد آمد */}
                <input type="text" placeholder="Type a message..." disabled/>
                <button disabled>Send</button>
            </div>
        </main>
    );
}

export default ChatWindow;