import React from 'react';
import './MessageItem.css';

function MessageItem({ message, isOwnMessage }) {
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // وضعیت تیک‌ها (ساده شده)
    let tickStatus = '';
    if (isOwnMessage) {
        if (message.readByRecipient) { // فرض می کنیم این فیلد در آبجکت پیام ست می شود
            tickStatus = <span className="ticks read">✓✓</span>; // دو تیک آبی
        } else if (message.deliveryStatus === 'delivered') {
            tickStatus = <span className="ticks delivered">✓✓</span>; // دو تیک خاکستری
        } else if (message.id && !message.tempId) { // اگر id دارد و موقت نیست یعنی به سرور رسیده
            tickStatus = <span className="ticks sent">✓</span>; // یک تیک خاکستری
        } else if (message.deliveryStatus === 'sending' || message.tempId) {
            tickStatus = <span className="ticks sending">🕒</span>; // آیکون ساعت برای در حال ارسال
        }
    }

    return (
        <div className={`message-item-wrapper ${isOwnMessage ? 'own-message' : 'other-message'}`}>
            <div className="message-bubble">
                {!isOwnMessage && message.sender && ( // نمایش نام فرستنده برای پیام‌های دیگران
                    <div className="message-sender-name">{message.sender.displayName || message.sender.username}</div>
                )}
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                    <span className="message-timestamp">{formatDate(message.createdAt)}</span>
                    {isOwnMessage && tickStatus}
                </div>
            </div>
        </div>
    );
}

export default MessageItem;