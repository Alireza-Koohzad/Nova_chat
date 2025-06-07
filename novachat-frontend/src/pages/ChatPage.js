// src/pages/ChatPage.js
import React, {useEffect, useState, useCallback} from 'react';
import Sidebar from '../components/layout/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import Header from '../components/layout/Header';
import {useAuth} from '../contexts/AuthContext';
import socketService from '../services/socketService';
import './ChatPage.css';

function ChatPage() {
    const {user, token, logout} = useAuth();
    const [selectedChat, setSelectedChat] = useState(null);
    const [userStatuses, setUserStatuses] = useState({});
    const [chats, setChats] = useState([]);

    const handleUserStatusChange = useCallback((statusData) => {
        setUserStatuses(prevStatuses => ({
            ...prevStatuses,
            [statusData.userId]: {status: statusData.status, lastSeenAt: statusData.lastSeenAt},
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

    const handleNewChatEvent = useCallback((newChatData) => {
        console.log("Socket event: newChat", newChatData);
        setChats(prevChats => {
            const existingChat = prevChats.find(c => c.id === newChatData.id);
            if (existingChat) {
                return prevChats.map(c => c.id === newChatData.id ? {
                    ...newChatData,
                    unreadCount: existingChat.unreadCount
                } : c); // حفظ unreadCount قبلی
            } else {
                // اضافه کردن چت جدید به ابتدا و مرتب سازی
                const updatedChats = [newChatData, ...prevChats];
                return updatedChats.sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
            }
        });

    }, []); // selectedChat از وابستگی حذف شد تا باعث انتخاب خودکار نشود مگر اینکه منطق خاصی بخواهیم

    const handleMemberAdded = useCallback((data) => { // data: { chatId, addedMember, actor }
        console.log("Socket event: memberAddedToGroup", data);
        setChats(prevChats => prevChats.map(chat => {
            if (chat.id === data.chatId) {
                // جلوگیری از اضافه کردن عضو تکراری (اگر به دلایلی رویداد چندبار بیاید)
                const memberExists = chat.members?.find(m => m.id === data.addedMember.id);
                const newMembers = memberExists ? chat.members : [...(chat.members || []), data.addedMember];
                return {...chat, members: newMembers, updatedAt: new Date().toISOString()}; // آپدیت updatedAt
            }
            return chat;
        }));
        if (selectedChat?.id === data.chatId) {
            setSelectedChat(prevChat => {
                const memberExists = prevChat.members?.find(m => m.id === data.addedMember.id);
                const newMembers = memberExists ? prevChat.members : [...(prevChat.members || []), data.addedMember];
                return {...prevChat, members: newMembers, updatedAt: new Date().toISOString()};
            });
        }
    }, [selectedChat]);


    const handleMemberLeftOrRemoved = useCallback((data) => { // data: { chatId, userId (left/removed), actor? }
        console.log("Socket event: memberLeftOrRemoved", data);
        const userIdAffected = data.userId;

        if (userIdAffected === user?.id && data.chatId === selectedChat?.id) {
            // اگر کاربر فعلی از گروه فعال خارج یا حذف شده، selectedChat را null کن
            setSelectedChat(null);
        }

        setChats(prevChats => {
            if (userIdAffected === user?.id) { // اگر کاربر فعلی خارج یا حذف شده
                return prevChats.filter(chat => chat.id !== data.chatId); // چت را از لیست حذف کن
            } else { // اگر کاربر دیگری خارج یا حذف شده
                return prevChats.map(chat => {
                    if (chat.id === data.chatId) {
                        const newMembers = chat.members?.filter(m => m.id !== userIdAffected);
                        return { ...chat, members: newMembers, updatedAt: new Date().toISOString() };
                    }
                    return chat;
                });
            }
        });

        if (selectedChat?.id === data.chatId && userIdAffected !== user?.id) {
            setSelectedChat(prevChat => ({
                ...prevChat,
                members: prevChat.members?.filter(m => m.id !== userIdAffected),
                updatedAt: new Date().toISOString()
            }));
        }
    }, [selectedChat, user]);


    const handleMessagesReadUpdateForList = useCallback((readData) => {
        const chatIdToUpdate = readData.chatId;
        if (!readData.readerId || readData.readerId === user?.id) {
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === chatIdToUpdate ? {...chat, unreadCount: 0} : chat
                )
            );
        }
    }, [user]);

    const handleCurrentOnlineUsers = useCallback((onlineUsersList) => {
        console.log("Received currentOnlineUsers via callback:", onlineUsersList);
        const initialStatuses = {};
        onlineUsersList.forEach(u => {
            initialStatuses[u.userId] = {status: u.status, lastSeenAt: u.lastSeenAt};
        });
        setUserStatuses(prevStatuses => ({...initialStatuses, ...prevStatuses}));
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
            socketService.onNewChat(handleNewChatEvent);
            socketService.onMemberAddedToGroup(handleMemberAdded);
            socketService.onMemberLeftGroup(handleMemberLeftOrRemoved);
            socketService.onMemberRemovedFromGroup(handleMemberLeftOrRemoved);

            return () => {
                socketService.offUserStatusChanged(handleUserStatusChange);
                socketService.offNewMessage(handleNewMessageForChatList);
                socketService.offMessagesReadByRecipient(handleMessagesReadUpdateForList);
                socketService.offMessagesSuccessfullyMarkedAsRead(handleMessagesReadUpdateForList);
                socketService.offCurrentOnlineUsers(handleCurrentOnlineUsers);
                socketService.offNewChat(handleNewChatEvent);
                socketService.offMemberAddedToGroup(handleMemberAdded);
                socketService.offMemberLeftGroup(handleMemberLeftOrRemoved);
                socketService.offMemberRemovedFromGroup(handleMemberLeftOrRemoved);
            };
        } else if (!token && socketService.isConnected()) {
            socketService.disconnect();
        }
    }, [
        token,
        user,
        handleUserStatusChange,
        handleNewMessageForChatList,
        handleMessagesReadUpdateForList,
        handleNewChatEvent,
        handleMemberAdded,
        handleMemberLeftOrRemoved
    ]);

    const handleSelectChat = useCallback((chat) => {
        if (selectedChat?.id === chat.id) return;

        if (selectedChat) {
            socketService.leaveChat(selectedChat.id);
        }
        setSelectedChat(chat);
        socketService.joinChat(chat.id);

        if (chat.unreadCount > 0) {
            setChats(prevChats =>
                prevChats.map(c => (c.id === chat.id ? {...c, unreadCount: 0} : c))
            );
        }
    }, [selectedChat]);

    // ** اصلاح اینجا: تعریف تابع onMessagesMarkedInWindow با useCallback **
    const handleMessagesMarkedInWindow = useCallback((chatId) => {
        setChats(prevChats =>
            prevChats.map(c => (c.id === chatId ? {...c, unreadCount: 0} : c))
        );
    }, []); // وابستگی خالی چون setChats خودش stable است

    if (!user) {
        return <div>Loading user data or redirecting...</div>;
    }

    return (
        <div className="chat-page-layout">
            <Header user={user} onLogout={logout}/>
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