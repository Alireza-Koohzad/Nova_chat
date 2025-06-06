import React, { useState, useEffect, useRef } from 'react';
import socketService from '../../services/socketService';
import './MessageInput.css';

function MessageInput({ onSendMessage, chatId }) {
    const [messageText, setMessageText] = useState('');
    const typingTimeoutRef = useRef(null); // برای مدیریت تایمر تایپینگ

    const handleInputChange = (e) => {
        setMessageText(e.target.value);
        if (!chatId) return;

        // ارسال رویداد تایپینگ
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        } else {
            // اگر تایمر نبود (یعنی اولین بار تایپ یا پس از توقف)، رویداد isTyping:true بفرست
            socketService.sendTyping({ chatId, isTyping: true });
        }

        typingTimeoutRef.current = setTimeout(() => {
            socketService.sendTyping({ chatId, isTyping: false });
            typingTimeoutRef.current = null; // ریست کردن تایمر
        }, 1500); // پس از ۱.۵ ثانیه عدم فعالیت، isTyping:false ارسال شود
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (messageText.trim()) {
            onSendMessage(messageText.trim());
            setMessageText(''); // پاک کردن فیلد پس از ارسال
            // توقف ارسال رویداد تایپینگ بلافاصله پس از ارسال پیام
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
            }
            if (chatId) socketService.sendTyping({ chatId, isTyping: false });
        }
    };

    // پاک کردن تایمر تایپینگ هنگام unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                // اگر کامپوننت از بین رفت و در حال تایپ بودیم، isTyping:false بفرست
                if (chatId) socketService.sendTyping({ chatId, isTyping: false });
            }
        };
    }, [chatId]); // chatId را به وابستگی اضافه می کنیم تا اگر چت عوض شد، تایمر ریست شود

    return (
        <form onSubmit={handleSubmit} className="message-input-form">
            {/* <button type="button" className="attachment-button">📎</button> {/ برای فایل ها در آینده /} */}
            <input
                type="text"
                value={messageText}
                onChange={handleInputChange}
                placeholder="Type a message..."
                className="message-text-input"
                autoComplete="off"
            />
            <button type="submit" className="send-message-button" disabled={!messageText.trim()}>
                {/* آیکون ارسال (می‌توانید از یک کتابخانه آیکون استفاده کنید) */}
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg>
            </button>
        </form>
    );
}

export default MessageInput;