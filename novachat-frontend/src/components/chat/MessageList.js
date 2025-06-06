import React from 'react';
import MessageItem from './MessageItem';
import './MessageList.css';

function MessageList({ messages, currentUser, isLoading, messagesEndRef }) {
    if (isLoading && messages.length === 0) {
        return <div className="message-list-loading">Loading messages...</div>;
    }

    if (!isLoading && messages.length === 0) {
        return <div className="message-list-empty">No messages yet. Start the conversation!</div>;
    }

    return (
        <div className="message-list-area">
            {/* A_REFACTOR: اینجا می توانید دکمه "Load older messages" را اضافه کنید */}
            {isLoading && messages.length > 0 && <div className="message-list-loading-more">Loading...</div>}
            {messages.map((msg, index) => (
                <MessageItem
                    key={msg.id || msg.tempId || index} // استفاده از tempId یا index اگر id هنوز نیست
                    message={msg}
                    isOwnMessage={msg.senderId === currentUser.id}
                />
            ))}
            <div ref={messagesEndRef} /> {/* عنصر خالی برای اسکرول به انتها */}
        </div>
    );
}

export default MessageList;