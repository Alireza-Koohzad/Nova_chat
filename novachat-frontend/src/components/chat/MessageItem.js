import React from 'react';
import './MessageItem.css';

function MessageItem({message, isOwnMessage}) {
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    };

    let tickIcon = null;
    if (isOwnMessage) {
        if (message.deliveryStatus === 'read') {
            tickIcon = <span className="message-ticks read" title="Read">✓✓</span>;
        } else if (message.deliveryStatus === 'delivered') {
            tickIcon = <span className="message-ticks delivered" title="Delivered">✓✓</span>;
        } else if (message.deliveryStatus === 'sent') {
            tickIcon = <span className="message-ticks sent" title="Sent">✓</span>;
        } else if (message.tempId || message.deliveryStatus === 'sending') {
            tickIcon = <span className="message-ticks sending" title="Sending...">🕒</span>;
        } else if (message.id && !message.tempId && !message.deliveryStatus) {
            // This path should ideally not be hit for messages from DB after backend changes
            // as 'sent' is the default. But as a fallback:
            tickIcon = <span className="message-ticks sent" title="Sent (assumed)">✓</span>;
        }
    }

    const renderMessageContent = () => {
        return message.content;
    };

    if (message.contentType === 'system') {
        return (
            <div className="message-item-wrapper system-message-wrapper">
                <div className="system-message-content">
                    {message.content}
                    <span className="message-timestamp system-timestamp">{formatDate(message.createdAt)}</span>
                </div>
            </div>
        );
    }


    return (
        <div
            className={`message-item-wrapper ${isOwnMessage ? 'own-message' : 'other-message'} message-type-${message.contentType || 'text'}`}>
            <div className="message-bubble">
                {!isOwnMessage && message.sender && (
                    <div className="message-sender-name">{message.sender.displayName || message.sender.username}</div>
                )}
                <div className="message-content">{renderMessageContent()}</div>
                <div className="message-meta">
                    <span className="message-timestamp">{formatDate(message.createdAt)}</span>
                    {isOwnMessage && tickIcon}
                </div>
            </div>
        </div>
    );
}

export default MessageItem;