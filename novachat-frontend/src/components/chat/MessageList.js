import React from 'react';
import MessageItem from './MessageItem';
import './MessageList.css';

const MESSAGES_PER_PAGE = 30; // Ensure this matches the value in ChatWindow.js

function MessageList({
                         messages,
                         currentUser,
                         isLoadingInitial,
                         isLoadingOlder,
                         hasMoreMessages,
                         onLoadMore,
                         messagesListRef,
                         messagesEndRef // Ref for the very end of the list
                     }) {

    if (isLoadingInitial && messages.length === 0) {
        return <div className="message-list-status">Loading messages...</div>;
    }

    if (!isLoadingInitial && messages.length === 0 && !hasMoreMessages) { // Added !hasMoreMessages condition
        return <div className="message-list-status">No messages yet. Say hi!</div>;
    }

    return (
        <div className="message-list-area" ref={messagesListRef}>
            {hasMoreMessages && (
                <div className="load-more-container">
                    <button onClick={onLoadMore} disabled={isLoadingOlder} className="load-more-button">
                        {isLoadingOlder ? 'Loading...' : 'Load Older Messages'}
                    </button>
                </div>
            )}
            {!hasMoreMessages && messages.length > 0 && ( // Check if messages exist before showing "no more"
                <div className="message-list-status small">No more messages to load.</div>
            )}

            {messages.map((msg, index) => (
                <MessageItem
                    key={msg.id || msg.tempId || `msg-${index}`} // Ensure key is always unique
                    message={msg}
                    isOwnMessage={currentUser && msg.senderId === currentUser.id} // Ensure currentUser is available
                />
            ))}
            <div ref={messagesEndRef} className="message-list-end-spacer" /> {/* Spacer for scrolling */}
        </div>
    );
}

export default MessageList;