// src/pages/ChatPage.js
import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/layout/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import Header from '../components/layout/Header';
import { useAuth } from '../contexts/AuthContext';
import socketService from '../services/socketService';
import './ChatPage.css';

function ChatPage() {
    const { user, token, logout } = useAuth();
    const [selectedChat, setSelectedChat] = useState(null);
    const [userStatuses, setUserStatuses] = useState({});
    const [chats, setChats] = useState([]);

    const handleUserStatusChange = useCallback((statusData) => {
        setUserStatuses(prevStatuses => ({
            ...prevStatuses,
            [statusData.userId]: { status: statusData.status, lastSeenAt: statusData.lastSeenAt },
        }));
    }, []);

    const handleNewMessageForChatList = useCallback((newMessage) => {
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === newMessage.chatId);
            let updatedChat;

            if (chatIndex !== -1) {
                updatedChat = {
                    ...prevChats[chatIndex],
                    lastMessage: {
                        id: newMessage.id,
                        content: newMessage.content,
                        contentType: newMessage.contentType,
                        createdAt: newMessage.createdAt,
                        senderId: newMessage.senderId,
                        sender: newMessage.sender,
                    },
                    unreadCount: (selectedChat?.id !== newMessage.chatId && newMessage.senderId !== user?.id)
                        ? (prevChats[chatIndex].unreadCount || 0) + 1
                        : prevChats[chatIndex].unreadCount,
                    updatedAt: newMessage.createdAt,
                };
            } else {
                // A_REFACTOR: مدیریت چت جدیدی که توسط کاربر دیگری شروع شده
                // در حال حاضر، اگر چت در لیست نباشد، آن را نادیده می گیریم
                // برای پیاده سازی کامل، باید اطلاعات چت را از سرور fetch کنیم یا سرور با پیام بفرستد
                console.warn("Received message for a chat not in the user's current list:", newMessage);
                return prevChats;
            }

            const newChatsArray = prevChats.filter(c => c.id !== updatedChat.id);
            newChatsArray.unshift(updatedChat); // چت آپدیت شده به ابتدای لیست
            return newChatsArray;
        });
    }, [selectedChat, user]);

    const handleMessagesReadUpdateForList = useCallback((readData) => {
        const chatIdToUpdate = readData.chatId;
        if (!readData.readerId || readData.readerId === user?.id) {
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === chatIdToUpdate ? { ...chat, unreadCount: 0 } : chat
                )
            );
        }
    }, [user]);

    const handleCurrentOnlineUsers = useCallback((onlineUsersList) => {
        console.log("Received currentOnlineUsers via callback:", onlineUsersList);
        const initialStatuses = {};
        onlineUsersList.forEach(u => {
            initialStatuses[u.userId] = { status: u.status, lastSeenAt: u.lastSeenAt };
        });
        setUserStatuses(prevStatuses => ({ ...initialStatuses, ...prevStatuses }));
    }, []); // بدون وابستگی، چون فقط state قبلی را آپدیت می‌کند

    useEffect(() => {
        if (token && user) {
            if (!socketService.isConnected()) {
                socketService.connect(token);
            }

            socketService.onUserStatusChanged(handleUserStatusChange);
            socketService.onNewMessage(handleNewMessageForChatList);
            socketService.onMessagesReadByRecipient(handleMessagesReadUpdateForList);
            socketService.onMessagesSuccessfullyMarkedAsRead(handleMessagesReadUpdateForList);
            socketService.onCurrentOnlineUsers(handleCurrentOnlineUsers);

            return () => {
                socketService.offUserStatusChanged(handleUserStatusChange);
                socketService.offNewMessage(handleNewMessageForChatList);
                socketService.offMessagesReadByRecipient(handleMessagesReadUpdateForList);
                socketService.offMessagesSuccessfullyMarkedAsRead(handleMessagesReadUpdateForList);
                socketService.offCurrentOnlineUsers(handleCurrentOnlineUsers);
            };
        } else if (!token && socketService.isConnected()) {
            socketService.disconnect();
        }
    }, [token, user, handleUserStatusChange, handleNewMessageForChatList, handleMessagesReadUpdateForList,handleCurrentOnlineUsers]);

    const handleSelectChat = useCallback((chat) => {
        if (selectedChat?.id === chat.id) return;

        if (selectedChat) {
            socketService.leaveChat(selectedChat.id);
        }
        setSelectedChat(chat);
        socketService.joinChat(chat.id);

        if (chat.unreadCount > 0) {
            setChats(prevChats =>
                prevChats.map(c => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
            );
        }
    }, [selectedChat]);

    // ** اصلاح اینجا: تعریف تابع onMessagesMarkedInWindow با useCallback **
    const handleMessagesMarkedInWindow = useCallback((chatId) => {
        setChats(prevChats =>
            prevChats.map(c => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
        );
    }, []); // وابستگی خالی چون setChats خودش stable است

    if (!user) {
        return <div>Loading user data or redirecting...</div>;
    }

    return (
        <div className="chat-page-layout">
            <Header user={user} onLogout={logout} />
            <div className="chat-page-main-content">
                <Sidebar
                    chats={chats}
                    setChats={setChats}
                    onSelectChat={handleSelectChat}
                    currentUser={user}
                    userStatuses={userStatuses}
                    selectedChatId={selectedChat?.id}
                />
                <ChatWindow
                    selectedChat={selectedChat}
                    currentUser={user}
                    userStatuses={userStatuses}
                    onMessagesMarkedAsRead={handleMessagesMarkedInWindow} // ** استفاده از تابع تعریف شده با useCallback **
                />
            </div>
        </div>
    );
}

export default ChatPage;