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
        // deliveryStatus: 'sending', 'sent', 'delivered', 'read'
        // readByRecipient: boolean (این را می توان از deliveryStatus === 'read' هم نتیجه گرفت)
        if (message.deliveryStatus === 'read' || message.readByRecipient) {
            tickIcon = <span className="message-ticks read">✓✓</span>;
        } else if (message.deliveryStatus === 'delivered') {
            tickIcon = <span className="message-ticks delivered">✓✓</span>;
        } else if (message.deliveryStatus === 'sent' || (message.id && !message.tempId && !message.deliveryStatus)) {
            // اگر id دارد و tempId ندارد و deliveryStatus هم ست نشده، یعنی sent
            tickIcon = <span className="message-ticks sent">✓</span>;
        } else if (message.deliveryStatus === 'sending' || message.tempId) {
            tickIcon = <span className="message-ticks sending">🕒</span>;
        }
    }

    const renderMessageContent = () => { /* ... (مانند قبل برای image و text) ... */
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
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                    <span className="message-timestamp">{formatDate(message.createdAt)}</span>
                    {isOwnMessage && tickIcon}
                </div>
            </div>
        </div>
    );
}

export default MessageItem;