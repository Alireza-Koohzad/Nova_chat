import React, { useEffect, useRef } from 'react'; // useRef اضافه شد
import MessageItem from './MessageItem';
import './MessageList.css';

function MessageList({
                         messages,
                         currentUser,
                         isLoadingInitial, // تغییر نام از isLoading
                         isLoadingOlder,
                         hasMoreMessages,
                         onLoadMore,
                         messagesListRef, // دریافت ref از والد
                         messagesEndRef
                     }) {



    if (isLoadingInitial) { // استفاده از isLoadingInitial
        return <div className="message-list-status">Loading messages...</div>;
    }

    if (!isLoadingInitial && messages.length === 0) {
        return <div className="message-list-status">No messages yet. Say hi!</div>;
    }


    return (
        <div className="message-list-area" ref={messagesListRef}> {/* استفاده از ref */}
            {hasMoreMessages && (
                <div className="load-more-container">
                    <button onClick={onLoadMore} disabled={isLoadingOlder} className="load-more-button">
                        {isLoadingOlder ? 'Loading...' : 'Load Older Messages'}
                    </button>
                </div>
            )}
            {!hasMoreMessages && messages.length > MESSAGES_PER_PAGE && ( // MESSAGES_PER_PAGE باید از جایی import یا تعریف شود
                <div className="message-list-status small">No more messages to load.</div>
            )}

            {messages.map((msg, index) => (
                <MessageItem
                    key={msg.id || msg.tempId || index}
                    message={msg}
                    isOwnMessage={msg.senderId === currentUser.id}
                />
            ))}
            <div ref={messagesEndRef} />
        </div>
    );
}
const MESSAGES_PER_PAGE = 30; // باید با مقدار ChatWindow یکی باشد

export default MessageList;