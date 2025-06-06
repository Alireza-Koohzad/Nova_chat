// src/components/chat/ChatWindow.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import chatServiceAPI from '../../services/chatServiceAPI';
import socketService from '../../services/socketService';
import { useAuth } from '../../contexts/AuthContext'; // currentUser از اینجا نمی آید، از props می آید
import './ChatWindow.css';

// currentUser از props دریافت می‌شود، نه از useAuth در اینجا
function ChatWindow({ selectedChat, currentUser, userStatuses, onMessagesMarkedAsRead }) {
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [typingUsers, setTypingUsers] = useState({});
    const { token } = useAuth(); // فقط توکن از useAuth لازم است
    const messagesEndRef = useRef(null);

    const scrollToBottom = useCallback(() => { // با useCallback برای پایداری
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const loadMessages = useCallback(async (chatId) => {
        if (!chatId || !token) return;
        setIsLoadingMessages(true);
        try {
            const fetchedMessages = await chatServiceAPI.getChatMessages(chatId, token, 50);
            setMessages(fetchedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

            if (fetchedMessages.length > 0) {
                const lastMessageId = fetchedMessages[fetchedMessages.length - 1].id;
                socketService.markMessagesAsRead({ chatId, lastSeenMessageId: lastMessageId });
                if (onMessagesMarkedAsRead) {
                    onMessagesMarkedAsRead(chatId);
                }
            } else {
                socketService.markMessagesAsRead({ chatId });
                if (onMessagesMarkedAsRead) {
                    onMessagesMarkedAsRead(chatId);
                }
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
        } finally {
            setIsLoadingMessages(false);
        }
    }, [token, onMessagesMarkedAsRead]); // onMessagesMarkedAsRead از props می‌آید و باید stable باشد (در ChatPage با useCallback تعریف شده)


    useEffect(() => {
        if (selectedChat?.id) { // بررسی وجود selectedChat.id
            setMessages([]);
            setTypingUsers({});
            loadMessages(selectedChat.id);
        } else {
            setMessages([]);
        }
    }, [selectedChat, loadMessages]); // loadMessages اکنون باید stable باشد


    useEffect(() => {
        if (messages.length > 0) { // فقط اگر پیامی وجود دارد اسکرول کن
            scrollToBottom();
        }
    }, [messages, scrollToBottom]); // scrollToBottom هم با useCallback تعریف شده


    const handleNewMessage = useCallback((newMessage) => {
        if (selectedChat?.id && newMessage.chatId === selectedChat.id) {
            setMessages(prevMessages => {
                const existingTempMessageIndex = newMessage.tempId ? prevMessages.findIndex(msg => msg.tempId === newMessage.tempId) : -1;
                const existingRealMessage = prevMessages.find(msg => msg.id === newMessage.id);

                if (existingTempMessageIndex !== -1) { // آپدیت پیام موقت با پیام واقعی
                    const updatedMessages = [...prevMessages];
                    updatedMessages[existingTempMessageIndex] = {...newMessage, tempId: undefined};
                    return updatedMessages;
                } else if (!existingRealMessage) { // اگر پیام واقعی از قبل وجود ندارد، اضافه کن
                    return [...prevMessages, newMessage];
                }
                return prevMessages; // اگر پیام واقعی از قبل وجود داشت (مثلا از کاربر دیگر آمده و دوباره ارسال شده)
            });

            if (newMessage.senderId !== currentUser?.id) { // currentUser از props
                socketService.markMessagesAsRead({ chatId: selectedChat.id, lastSeenMessageId: newMessage.id });
            }
        }
    }, [selectedChat, currentUser]); // currentUser از props

    const handleTypingEvent = useCallback((typingData) => {
        if (selectedChat?.id && typingData.chatId === selectedChat.id && typingData.userId !== currentUser?.id) {
            setTypingUsers(prev => ({ ...prev, [typingData.userId]: typingData.isTyping }));
        }
    }, [selectedChat, currentUser]); // currentUser از props

    const handleMessageStatusUpdate = useCallback((statusUpdate) => {
        if (selectedChat?.id && statusUpdate.chatId === selectedChat.id) {
            setMessages(prevMessages => prevMessages.map(msg => {
                if (msg.id === statusUpdate.messageId && msg.senderId === currentUser?.id) { // فقط پیام های خودمان
                    return { ...msg, deliveryStatus: statusUpdate.status, readByRecipient: statusUpdate.status === 'read' };
                }
                return msg;
            }));
        }
    }, [selectedChat, currentUser]); // currentUser از props

    const handleMessagesReadByOther = useCallback((readData) => {
        if (selectedChat?.id && readData.chatId === selectedChat.id && readData.readerId !== currentUser?.id) {
            setMessages(prevMessages => prevMessages.map(msg => {
                if (msg.senderId === currentUser?.id) {
                    // A_REFACTOR: مقایسه دقیق تر با lastReadMessageId
                    // فعلا همه پیام های قبلی را خوانده شده توسط دیگران در نظر می گیریم (برای نمایش تیک آبی)
                    return { ...msg, readByRecipient: true };
                }
                return msg;
            }));
        }
    }, [selectedChat, currentUser]); // currentUser از props

    useEffect(() => {
        if (selectedChat?.id) { // فقط اگر چتی انتخاب شده listener ها را ثبت کن
            socketService.onNewMessage(handleNewMessage);
            socketService.onTyping(handleTypingEvent);
            socketService.onMessageStatusUpdate(handleMessageStatusUpdate);
            socketService.onMessagesReadByRecipient(handleMessagesReadByOther);

            return () => {
                socketService.offNewMessage(handleNewMessage);
                socketService.offTyping(handleTypingEvent);
                socketService.offMessageStatusUpdate(handleMessageStatusUpdate);
                socketService.offMessagesReadByRecipient(handleMessagesReadByOther);
            };
        }
    }, [selectedChat, handleNewMessage, handleTypingEvent, handleMessageStatusUpdate, handleMessagesReadByOther]);
    // selectedChat به وابستگی اضافه شد تا listener ها برای چت جدید دوباره ثبت شوند


    const handleSendMessage = (content) => {
        if (!selectedChat?.id || !content.trim() || !currentUser?.id) return;
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const messageData = {
            chatId: selectedChat.id,
            content: content.trim(),
            contentType: 'text',
            tempId: tempId,
        };

        const tempMessageObject = {
            ...messageData, // شامل tempId, chatId, content, contentType
            id: tempId,
            senderId: currentUser.id,
            sender: {
                id: currentUser.id,
                username: currentUser.username,
                displayName: currentUser.displayName,
                profileImageUrl: currentUser.profileImageUrl,
            },
            createdAt: new Date().toISOString(),
            deliveryStatus: 'sending',
        };
        setMessages(prevMessages => [...prevMessages, tempMessageObject]);
        socketService.sendMessage(messageData);
    };

    const getChatDisplayInfo = useCallback(() => { // با useCallback برای پایداری
        if (!selectedChat) return { name: '', recipientId: null, avatarInitial: '?' };
        if (selectedChat.type === 'private' && selectedChat.members) {
            const otherMember = selectedChat.members.find(m => m.id !== currentUser?.id); // currentUser از props
            return {
                name: otherMember?.displayName || otherMember?.username || 'User',
                recipientId: otherMember?.id,
                avatarInitial: (otherMember?.displayName || otherMember?.username || 'U').substring(0, 1).toUpperCase(),
            };
        }
        return {
            name: selectedChat.name || 'Group Chat',
            recipientId: null,
            avatarInitial: (selectedChat.name || 'G').substring(0,1).toUpperCase()
        };
    }, [selectedChat, currentUser]); // currentUser از props

    const displayInfo = getChatDisplayInfo();
    const recipientStatusInfo = displayInfo.recipientId ? userStatuses[displayInfo.recipientId] : null;
    let statusText = '';
    if (recipientStatusInfo) {
        statusText = recipientStatusInfo.status;
        if (recipientStatusInfo.status === 'offline' && recipientStatusInfo.lastSeenAt) {
            const lastSeenDate = new Date(recipientStatusInfo.lastSeenAt);
            statusText = `last seen ${lastSeenDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            if (lastSeenDate.toLocaleDateString() !== new Date().toLocaleDateString()) {
                statusText += ` on ${lastSeenDate.toLocaleDateString()}`;
            }
        }
    }

    const typingUserNames = Object.entries(typingUsers)
        .filter(([, isTyping]) => isTyping) // فقط آنهایی که isTyping true است
        .map(([userId]) => {
            const chatMember = selectedChat?.members?.find(m => m.id === userId);
            return chatMember?.displayName || chatMember?.username || 'Someone';
        })
        .join(', ');

    if (!selectedChat) {
        return (
            <div className="chat-window-placeholder">
                <p>Select a chat to start messaging</p>
            </div>
        );
    }

    return (
        <main className="chat-window-container">
            <header className="chat-window-header">
                <div className="chat-header-avatar">
                    {displayInfo.avatarInitial}
                    {recipientStatusInfo?.status === 'online' && <span className="header-status-dot online"></span>}
                </div>
                <div className="chat-header-info">
                    <h3>{displayInfo.name}</h3>
                    {statusText && (
                        <span className={`chat-status-text ${recipientStatusInfo?.status}`}>
              {statusText}
            </span>
                    )}
                </div>
            </header>

            <MessageList
                messages={messages}
                currentUser={currentUser} // currentUser از props
                isLoading={isLoadingMessages}
                messagesEndRef={messagesEndRef}
            />

            {typingUserNames && <div className="typing-indicator">{typingUserNames} is typing...</div>}

            <MessageInput onSendMessage={handleSendMessage} chatId={selectedChat.id} />
        </main>
    );
}

export default ChatWindow;