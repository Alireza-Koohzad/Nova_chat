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
                    updatedAt: newMessage.createdAt, // Ensure updatedAt is updated for sorting
                };
            } else {
                console.warn("Received message for a chat not in the user's current list:", newMessage);
                // Potentially fetch chat details if it's a truly new chat initiated by another user
                // For now, we might just ignore or have a placeholder
                // To fully handle this, the server should emit 'newChat' event or client fetches chat details.
                return prevChats; // Or handle creation of a new chat entry if necessary
            }

            // Remove old chat, add updated chat to the beginning, then sort
            const newChatsArray = [updatedChat, ...prevChats.filter(c => c.id !== updatedChat.id)];
            return newChatsArray.sort((a, b) => {
                const dateA = new Date(a.lastMessage?.createdAt || a.updatedAt || 0);
                const dateB = new Date(b.lastMessage?.createdAt || b.updatedAt || 0);
                return dateB - dateA;
            });
        });
    }, [selectedChat, user]);

    const handleNewChatEvent = useCallback((newChatData) => {
        console.log("Socket event: newChat", newChatData);
        setChats(prevChats => {
            const existingChat = prevChats.find(c => c.id === newChatData.id);
            if (existingChat) {
                // Update existing chat if needed, ensuring unread count from local state is preserved if it's more relevant
                return prevChats.map(c => c.id === newChatData.id ? {
                    ...newChatData, // Server data is primary
                    unreadCount: newChatData.unreadCount !== undefined ? newChatData.unreadCount : (existingChat.unreadCount || 0)
                } : c).sort((a,b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
            } else {
                // Add new chat to the list and sort
                const updatedChats = [newChatData, ...prevChats];
                return updatedChats.sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
            }
        });
    }, []);

    const handleMemberAdded = useCallback((data) => {
        console.log("Socket event: memberAddedToGroup", data);
        setChats(prevChats => prevChats.map(chat => {
            if (chat.id === data.chatId) {
                const memberExists = chat.members?.find(m => m.id === data.addedMember.id);
                const newMembers = memberExists ? chat.members : [...(chat.members || []), data.addedMember];
                return {...chat, members: newMembers, updatedAt: new Date().toISOString()};
            }
            return chat;
        }).sort((a,b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0)));

        if (selectedChat?.id === data.chatId) {
            setSelectedChat(prevChat => {
                const memberExists = prevChat.members?.find(m => m.id === data.addedMember.id);
                const newMembers = memberExists ? prevChat.members : [...(prevChat.members || []), data.addedMember];
                return {...prevChat, members: newMembers, updatedAt: new Date().toISOString()};
            });
        }
        // Update last message in sidebar if a system message was sent
        if (data.systemMessage) {
            handleNewMessageForChatList(data.systemMessage);
        }
    }, [selectedChat, handleNewMessageForChatList]);


    const handleMemberLeftOrRemoved = useCallback((data) => {
        console.log("Socket event: memberLeftOrRemoved", data);
        const userIdAffected = data.userId || data.userIdRemoved; // Accommodate both event structures

        if (userIdAffected === user?.id && data.chatId === selectedChat?.id) {
            setSelectedChat(null);
        }

        setChats(prevChats => {
            if (userIdAffected === user?.id) {
                return prevChats.filter(chat => chat.id !== data.chatId);
            } else {
                return prevChats.map(chat => {
                    if (chat.id === data.chatId) {
                        const newMembers = chat.members?.filter(m => m.id !== userIdAffected);
                        return { ...chat, members: newMembers, updatedAt: new Date().toISOString() };
                    }
                    return chat;
                }).sort((a,b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
            }
        });

        if (selectedChat?.id === data.chatId && userIdAffected !== user?.id) {
            setSelectedChat(prevChat => ({
                ...prevChat,
                members: prevChat.members?.filter(m => m.id !== userIdAffected),
                updatedAt: new Date().toISOString()
            }));
        }
        // Update last message in sidebar if a system message was sent
        if (data.systemMessage) {
            handleNewMessageForChatList(data.systemMessage);
        }
    }, [selectedChat, user, handleNewMessageForChatList]);


    const handleMessagesReadUpdateForList = useCallback((readData) => {
        const chatIdToUpdate = readData.chatId;
        if (readData.readerId === user?.id || (readData.eventSource === 'selfMarkedRead' && readData.userId === user?.id) || (readData.messagesSuccessfullyMarkedAsRead && readData.readerId === user?.id)) {
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
    }, []);

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
        handleCurrentOnlineUsers,
        handleNewChatEvent,
        handleMemberAdded,
        handleMemberLeftOrRemoved
    ]);

    const handleMessagesMarkedInWindow = useCallback((chatId) => {
        setChats(prevChats =>
            prevChats.map(c => (c.id === chatId ? {...c, unreadCount: 0} : c))
        );
    }, []);


    const handleSelectChat = useCallback((chat) => {
        if (selectedChat?.id === chat.id) return;

        if (selectedChat) {
            socketService.leaveChat(selectedChat.id);
        }
        setSelectedChat(chat);
        socketService.joinChat(chat.id);

        if (chat.unreadCount > 0) {
            // Optimistically update unread count on client
            setChats(prevChats =>
                prevChats.map(c => (c.id === chat.id ? {...c, unreadCount: 0} : c))
            );
            // ChatWindow will handle marking messages as read when it loads for this chat.
            // The `handleMessagesMarkedInWindow` callback will be triggered by ChatWindow.
        }
    }, [selectedChat]);

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
                    onMessagesMarkedAsRead={handleMessagesMarkedInWindow}
                />
            </div>
        </div>
    );
}

export default ChatPage;
