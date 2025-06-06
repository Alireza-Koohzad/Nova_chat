import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/layout/Sidebar';
import ChatWindow from '../components/chat/ChatWindow'; // کامپوننت چت اصلی
import Header from '../components/layout/Header'; // یک هدر برای برنامه
import { useAuth } from '../contexts/AuthContext';
import socketService from '../services/socketService';
import './ChatPage.css'; // استایل‌های این صفحه

function ChatPage() {
    const { user, token, logout } = useAuth();
    const [selectedChat, setSelectedChat] = useState(null);
    const [userStatuses, setUserStatuses] = useState({}); // { userId: { status: 'online' | 'offline', lastSeenAt: Date } }
    const [chats, setChats] = useState([]); // لیست چت ها برای ارسال به Sidebar و آپدیت از طریق سوکت

    // دریافت رویداد تغییر وضعیت کاربران
    const handleUserStatusChange = useCallback((statusData) => {
        console.log("User status changed (ChatPage):", statusData);
        setUserStatuses(prevStatuses => ({
            ...prevStatuses,
            [statusData.userId]: { status: statusData.status, lastSeenAt: statusData.lastSeenAt },
        }));
    }, []);

    // دریافت پیام جدید (برای آپدیت لیست چت ها - unread count و last message)
    const handleNewMessageForChatList = useCallback((newMessage) => {
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === newMessage.chatId);
            if (chatIndex === -1) {
                // اگر چت جدید است، باید از سرور fetch شود یا اطلاعاتش با پیام بیاید
                // فعلا این حالت را ساده نگه می داریم و فرض می کنیم چت از قبل وجود دارد
                return prevChats;
            }

            const updatedChat = {
                ...prevChats[chatIndex],
                lastMessage: { // ساختار lastMessage را با پیام جدید آپدیت کن
                    content: newMessage.content,
                    contentType: newMessage.contentType,
                    createdAt: newMessage.createdAt,
                    senderId: newMessage.senderId,
                    // sender: newMessage.sender // اگر سرور اطلاعات فرستنده را می فرستد
                },
                // اگر پیام از طرف کاربر دیگری است و چت فعال نیست، unreadCount را افزایش بده
                unreadCount: (selectedChat?.id !== newMessage.chatId && newMessage.senderId !== user.id)
                    ? (prevChats[chatIndex].unreadCount || 0) + 1
                    : prevChats[chatIndex].unreadCount
            };

            const newChatsArray = [...prevChats];
            newChatsArray.splice(chatIndex, 1); // حذف چت قدیمی
            newChatsArray.unshift(updatedChat); // اضافه کردن چت آپدیت شده به ابتدای لیست
            return newChatsArray;
        });
    }, [selectedChat, user]);

    // دریافت رویداد خوانده شدن پیام ها (برای آپدیت unread count در لیست چت ها)
    const handleMessagesRead = useCallback((readData) => { // { chatId, readerId, lastReadMessageId }
        if (readData.readerId === user.id) { // اگر خودم پیام ها را خواندم
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === readData.chatId ? { ...chat, unreadCount: 0 } : chat
                )
            );
        }
    }, [user]);


    useEffect(() => {
        if (token && user) { // اطمینان از وجود توکن و کاربر
            if (!socketService.isConnected()) { // فقط اگر متصل نیست، وصل شو
                socketService.connect(token);
            }

            socketService.onUserStatusChanged(handleUserStatusChange);
            socketService.onNewMessage(handleNewMessageForChatList); // برای آپدیت لیست چت ها
            socketService.onMessagesReadByRecipient(handleMessagesRead); // اگر دیگران خواندند
            socketService.on('messagesSuccessfullyMarkedAsRead', handleMessagesRead); // اگر خودم خواندم (بک اند باید این را بفرستد)


            // در زمان unmount کامپوننت، listener ها را حذف کن
            // قطع اتصال سوکت در logout انجام می‌شود
            return () => {
                socketService.offUserStatusChanged(handleUserStatusChange);
                socketService.offNewMessage(handleNewMessageForChatList);
                socketService.offMessagesReadByRecipient(handleMessagesRead);
                socketService.off('messagesSuccessfullyMarkedAsRead', handleMessagesRead);
            };
        }
    }, [token, user, handleUserStatusChange, handleNewMessageForChatList, handleMessagesRead]);


    const handleSelectChat = (chat) => {
        if (selectedChat?.id === chat.id) return; // اگر همان چت دوباره انتخاب شد کاری نکن

        if (selectedChat) {
            socketService.leaveChat(selectedChat.id); // ترک روم چت قبلی
        }
        setSelectedChat(chat);
        socketService.joinChat(chat.id); // پیوستن به روم چت جدید

        // ریست کردن unreadCount برای چت انتخاب شده در UI
        if (chat.unreadCount > 0) {
            setChats(prevChats =>
                prevChats.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c)
            );
            // به سرور هم اطلاع بده که پیام ها خوانده شده اند (در ChatWindow انجام خواهد شد)
        }
    };

    if (!user) {
        return <div>Loading user data or redirecting...</div>;
    }

    return (
        <div className="chat-page-layout">
            <Header user={user} onLogout={logout} />
            <div className="chat-page-main-content">
                <Sidebar
                    chats={chats} // ارسال لیست چت ها از state والد
                    setChats={setChats} // برای اینکه Sidebar بتواند لیست را مستقیما آپدیت کند (مثلا پس از شروع چت جدید)
                    onSelectChat={handleSelectChat}
                    currentUser={user}
                    userStatuses={userStatuses}
                    selectedChatId={selectedChat?.id}
                />
                <ChatWindow
                    selectedChat={selectedChat}
                    currentUser={user}
                    userStatuses={userStatuses}
                    // وقتی پیام ها در ChatWindow خوانده می شوند، این تابع را برای آپدیت لیست چت ها صدا بزن
                    onMessagesViewedInChatWindow={(chatId) => {
                        setChats(prevChats =>
                            prevChats.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c)
                        );
                    }}
                />
            </div>
        </div>
    );
}

export default ChatPage;