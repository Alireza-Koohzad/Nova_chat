// src/components/chat/ChatWindow.js
import React, {useState, useEffect, useRef, useCallback} from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import chatServiceAPI from '../../services/chatServiceAPI';
import socketService from '../../services/socketService';
import {useAuth} from '../../contexts/AuthContext'; // currentUser از اینجا نمی آید، از props می آید
import './ChatWindow.css';

const MESSAGES_PER_PAGE = 30; // یا هر تعداد دلخواه دیگر

function ChatWindow({selectedChat, currentUser, userStatuses, onMessagesMarkedAsRead}) {
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false); // برای بارگذاری اولیه
    const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false); // برای بارگذاری قدیمی‌ترها
    const [hasMoreMessages, setHasMoreMessages] = useState(true); // آیا پیام قدیمی‌تری هست؟
    const [currentPage, setCurrentPage] = useState(1); // برای offset یا page number
    const [typingUsers, setTypingUsers] = useState({});
    const {token} = useAuth();
    const messagesListRef = useRef(null); // Ref برای div ای که اسکرول دارد (MessageList)
    const messagesEndRef = useRef(null); // Ref برای انتهای لیست پیام ها (اسکرول به پایین)
    const [initialLoadComplete, setInitialLoadComplete] = useState(false); // برای جلوگیری از اسکرول در بارگذاری اولیه

    const scrollToBottom = useCallback((behavior = "smooth") => {
        messagesEndRef.current?.scrollIntoView({behavior});
    }, []);

    const loadMessages = useCallback(async (chatId, page = 1, loadOlder = false) => {
        if (!chatId || !token) return;

        if (loadOlder) {
            setIsLoadingOlderMessages(true);
        } else {
            setIsLoadingMessages(true);
            setMessages([]); // پاک کردن پیام های قبلی برای بارگذاری اولیه چت جدید
            setCurrentPage(1); // ریست کردن صفحه
            setHasMoreMessages(true); // ریست کردن وضعیت hasMore
            setInitialLoadComplete(false);
        }

        try {
            const offset = (page - 1) * MESSAGES_PER_PAGE;
            const fetchedMessages = await chatServiceAPI.getChatMessages(chatId, token, MESSAGES_PER_PAGE, offset);
            const sortedMessages = fetchedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            if (loadOlder) {
                setMessages(prevMessages => [...sortedMessages, ...prevMessages]); // پیام های قدیمی تر به ابتدا اضافه می شوند
                // حفظ موقعیت اسکرول (این بخش می تواند پیچیده باشد)
                // یک راه ساده: اگر به بالا اسکرول کرده بودیم، سعی کن همانجا بمانیم
                if (messagesListRef.current) {
                    const oldScrollHeight = messagesListRef.current.scrollHeight;
                    // پس از آپدیت state، اسکرول را تنظیم کن (در یک microtask)
                    requestAnimationFrame(() => {
                        if (messagesListRef.current) {
                            messagesListRef.current.scrollTop += (messagesListRef.current.scrollHeight - oldScrollHeight);
                        }
                    });
                }

            } else {
                setMessages(sortedMessages);
                // پس از بارگذاری اولیه موفق، پیام‌ها را به عنوان خوانده شده علامت بزن
                if (sortedMessages.length > 0) {
                    const lastMessageId = sortedMessages[sortedMessages.length - 1].id;
                    socketService.markMessagesAsRead({chatId, lastSeenMessageId: lastMessageId});
                    if (onMessagesMarkedAsRead) {
                        onMessagesMarkedAsRead(chatId);
                    }
                } else { // اگر پیامی نبود هم unreadCount باید صفر شود
                    socketService.markMessagesAsRead({chatId});
                    if (onMessagesMarkedAsRead) {
                        onMessagesMarkedAsRead(chatId);
                    }
                }
            }

            setHasMoreMessages(fetchedMessages.length === MESSAGES_PER_PAGE);
            setCurrentPage(page);

        } catch (error) {
            console.error("Failed to load messages:", error);
        } finally {
            if (loadOlder) {
                setIsLoadingOlderMessages(false);
            } else {
                setIsLoadingMessages(false);
                setInitialLoadComplete(true); // بارگذاری اولیه تمام شد
            }
        }
    }, [token, onMessagesMarkedAsRead]);


    useEffect(() => {
        if (selectedChat?.id) {
            loadMessages(selectedChat.id, 1, false); // بارگذاری اولیه صفحه اول
        } else {
            setMessages([]);
            setHasMoreMessages(true);
            setCurrentPage(1);
            setInitialLoadComplete(false);
        }
    }, [selectedChat, loadMessages]);


    useEffect(() => {
        // اسکرول به پایین فقط در بارگذاری اولیه یا دریافت پیام جدید، نه هنگام بارگذاری پیام های قدیمی
        if (initialLoadComplete && messages.length > 0 && !isLoadingOlderMessages) {
            // بررسی اینکه آیا آخرین پیام، پیام خودمان است یا پیام جدیدی دریافت شده
            // این شرط برای جلوگیری از اسکرول ناخواسته هنگام بارگذاری پیام های قدیمی مفید است
            // اما ممکن است نیاز به تنظیم دقیق تری داشته باشد
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.senderId === currentUser?.id && lastMessage?.tempId) {
                // اگر پیام موقت از خودمان است، اسکرول کن
                scrollToBottom("auto"); // اسکرول فوری برای پیام خودمان
            } else if (messagesListRef.current &&
                messagesListRef.current.scrollHeight - messagesListRef.current.scrollTop <= messagesListRef.current.clientHeight + 200) {
                // اگر کاربر نزدیک به پایین اسکرول است، به پایین اسکرول کن
                scrollToBottom();
            }
        } else if (messages.length > 0 && !initialLoadComplete) {
            // برای بارگذاری اولیه، پس از چند لحظه اسکرول کن تا DOM آپدیت شود
            setTimeout(() => scrollToBottom("auto"), 100);
        }
    }, [messages, initialLoadComplete, isLoadingOlderMessages, currentUser, scrollToBottom]);


    const handleNewMessage = useCallback((newMessage) => {
        if (selectedChat?.id && newMessage.chatId === selectedChat.id) {
            setMessages(prevMessages => {
                const existingTempMessageIndex = newMessage.tempId ? prevMessages.findIndex(msg => msg.tempId === newMessage.tempId) : -1;
                const existingRealMessage = prevMessages.find(msg => msg.id === newMessage.id);

                if (existingTempMessageIndex !== -1) {
                    const updatedMessages = [...prevMessages];
                    updatedMessages[existingTempMessageIndex] = {
                        ...newMessage,
                        tempId: undefined,
                        deliveryStatus: 'sent'
                    }; // وضعیت به sent تغییر کند
                    return updatedMessages;
                } else if (!existingRealMessage) {
                    return [...prevMessages, {...newMessage, deliveryStatus: 'received'}]; // پیام دریافتی
                }
                return prevMessages;
            });

            if (newMessage.senderId !== currentUser?.id) {
                socketService.markMessagesAsRead({chatId: selectedChat.id, lastSeenMessageId: newMessage.id});
            }
        }
    }, [selectedChat, currentUser]); // currentUser از props


    const handleTypingEvent = useCallback((typingData) => { /* ... (مانند قبل) ... */
        if (selectedChat?.id && typingData.chatId === selectedChat.id && typingData.userId !== currentUser?.id) {
            setTypingUsers(prev => ({ ...prev, [typingData.userId]: typingData.isTyping }));
        }
    }, [selectedChat, currentUser]);


    const handleMessageStatusUpdate = useCallback((statusUpdate) => { /* ... (مانند قبل) ... */
        if (selectedChat?.id && statusUpdate.chatId === selectedChat.id) {
            setMessages(prevMessages => prevMessages.map(msg => {
                if (msg.id === statusUpdate.messageId && msg.senderId === currentUser?.id) {
                    let newStatus = msg.deliveryStatus;
                    if (statusUpdate.status === 'delivered' && newStatus !== 'read') newStatus = 'delivered';
                    if (statusUpdate.status === 'read') newStatus = 'read'; // read اولویت دارد
                    return { ...msg, deliveryStatus: newStatus, readByRecipient: newStatus === 'read' };
                }
                return msg;
            }));
        }
    }, [selectedChat, currentUser]);


    const handleMessagesReadByOther = useCallback((readData) => { /* ... (مانند قبل) ... */
        if (selectedChat?.id && readData.chatId === selectedChat.id && readData.readerId !== currentUser?.id) {
            setMessages(prevMessages => prevMessages.map(msg => {
                if (msg.senderId === currentUser?.id) {
                    // A_REFACTOR: مقایسه دقیق تر با lastReadMessageId
                    // اگر پیام قبل یا مساوی lastReadMessageId است، آن را read کن
                    // const messageDate = new Date(msg.createdAt);
                    // const lastReadDate = new Date( (پیام با شناسه readData.lastReadMessageId).createdAt );
                    // if (messageDate <= lastReadDate) return { ...msg, readByRecipient: true, deliveryStatus: 'read' };

                    // برای سادگی فعلی، همه را read در نظر می گیریم
                    return { ...msg, readByRecipient: true, deliveryStatus: 'read' };
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
        if (!selectedChat) return {name: '', recipientId: null, avatarInitial: '?'};
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
            avatarInitial: (selectedChat.name || 'G').substring(0, 1).toUpperCase()
        };
    }, [selectedChat, currentUser]); // currentUser از props

    const displayInfo = getChatDisplayInfo();
    const recipientStatusInfo = displayInfo.recipientId ? userStatuses[displayInfo.recipientId] : null;
    let statusText = '';
    if (recipientStatusInfo) {
        statusText = recipientStatusInfo.status;
        if (recipientStatusInfo.status === 'offline' && recipientStatusInfo.lastSeenAt) {
            const lastSeenDate = new Date(recipientStatusInfo.lastSeenAt);
            statusText = `last seen ${lastSeenDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
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

    const handleLoadMoreMessages = () => {
        if (selectedChat?.id && hasMoreMessages && !isLoadingOlderMessages) {
            loadMessages(selectedChat.id, currentPage + 1, true);
        }
    };
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
                currentUser={currentUser}
                isLoadingInitial={isLoadingMessages && messages.length === 0} // فقط برای بارگذاری اولیه
                isLoadingOlder={isLoadingOlderMessages}
                hasMoreMessages={hasMoreMessages}
                onLoadMore={handleLoadMoreMessages}
                messagesListRef={messagesListRef} // Ref برای div لیست پیام ها
                messagesEndRef={messagesEndRef}
            />

            {typingUserNames && <div className="typing-indicator">{typingUserNames} is typing...</div>}

            <MessageInput onSendMessage={handleSendMessage} chatId={selectedChat.id}/>
        </main>
    );
}

export default ChatWindow;