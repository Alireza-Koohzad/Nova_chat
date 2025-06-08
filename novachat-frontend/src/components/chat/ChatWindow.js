// src/components/chat/ChatWindow.js
import React, {useState, useEffect, useRef, useCallback} from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import chatServiceAPI from '../../services/chatServiceAPI';
import socketService from '../../services/socketService';
import {useAuth} from '../../contexts/AuthContext';
import './ChatWindow.css';
import { UsersIcon, MessageSquareIcon } from '../icons'; // Added MessageSquareIcon for placeholder

const MESSAGES_PER_PAGE = 30;

function ChatWindow({selectedChat, currentUser, userStatuses, onMessagesMarkedAsRead}) { // Removed onChatDetailsUpdated
    const [messages, setMessages] = useState([]);
    const [isLoadingInitialMessages, setIsLoadingInitialMessages] = useState(false);
    const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [typingUsers, setTypingUsers] = useState({});
    const {token} = useAuth();

    const messagesListRef = useRef(null);
    const messagesEndRef = useRef(null); // Ref for the actual end of messages
    const [isNearBottom, setIsNearBottom] = useState(true); // Track if user is near the bottom

    const scrollToBottom = useCallback((behavior = "smooth") => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({behavior, block: "end"});
        }
    }, []);

    const handleScroll = useCallback(() => {
        if (messagesListRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesListRef.current;
            setIsNearBottom(scrollHeight - scrollTop <= clientHeight + (clientHeight * 0.5));

            if (scrollTop === 0 && hasMoreMessages && !isLoadingInitialMessages && !isLoadingOlderMessages) {
                //currentPage is already the current page, so for next older page, it's currentPage + 1
                loadMessages(selectedChat.id, currentPage + 1, true);
            }
        }
    }, [hasMoreMessages, isLoadingInitialMessages, isLoadingOlderMessages, selectedChat, currentPage]);

    // Attach scroll listener
    useEffect(() => {
        const listElement = messagesListRef.current;
        if (listElement) {
            listElement.addEventListener('scroll', handleScroll);
            return () => listElement.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);


    const loadMessages = useCallback(async (chatId, page = 1, loadOlder = false) => {
        if (!chatId || !token) return;

        const offset = (page - 1) * MESSAGES_PER_PAGE; // Define offset here

        if (loadOlder) {
            setIsLoadingOlderMessages(true);
        } else {
            setIsLoadingInitialMessages(true);
            setMessages([]); // Reset messages for new chat or refresh
            setCurrentPage(1); // Reset page for new chat or refresh
            setHasMoreMessages(true); // Assume there are messages until API confirms otherwise
        }

        try {
            const fetchedMessages = await chatServiceAPI.getChatMessages(chatId, token, MESSAGES_PER_PAGE, offset);
            // Messages from API are already sorted oldest first (ASC) if API guarantees order
            const sortedMessages = fetchedMessages;

            const oldScrollHeight = messagesListRef.current?.scrollHeight || 0;
            const oldScrollTop = messagesListRef.current?.scrollTop || 0;

            setMessages(prevMessages =>
                loadOlder ? [...sortedMessages, ...prevMessages] : sortedMessages
            );

            if (loadOlder && messagesListRef.current && sortedMessages.length > 0) {
                requestAnimationFrame(() => { // Ensure DOM update before scrolling
                    if (messagesListRef.current) {
                        messagesListRef.current.scrollTop = (messagesListRef.current.scrollHeight - oldScrollHeight) + oldScrollTop;
                    }
                });
            } else if (!loadOlder && sortedMessages.length > 0) {
                const lastVisibleMessage = sortedMessages[sortedMessages.length - 1];
                socketService.markMessagesAsRead({chatId, lastSeenMessageId: lastVisibleMessage.id});
                if (onMessagesMarkedAsRead) {
                    onMessagesMarkedAsRead(chatId);
                }
            } else if (!loadOlder && sortedMessages.length === 0) {
                socketService.markMessagesAsRead({chatId});
                if (onMessagesMarkedAsRead) {
                    onMessagesMarkedAsRead(chatId);
                }
            }

            setHasMoreMessages(fetchedMessages.length === MESSAGES_PER_PAGE);
            if (fetchedMessages.length > 0 || page === 1) {
                setCurrentPage(page); // Update current page only if messages were fetched or it's the first page
            }

        } catch (error) {
            console.error("Failed to load messages:", error);
        } finally {
            if (loadOlder) setIsLoadingOlderMessages(false);
            else setIsLoadingInitialMessages(false);
        }
    }, [token, onMessagesMarkedAsRead]);

    useEffect(() => {
        if (selectedChat?.id) {
            loadMessages(selectedChat.id, 1, false); // Load page 1 when chat changes
        } else {
            setMessages([]);
            setHasMoreMessages(true); // Reset for placeholder
            setCurrentPage(1); // Reset for placeholder
            setIsLoadingInitialMessages(false); // Ensure loading state is false
        }
    }, [selectedChat?.id, loadMessages]);


    useEffect(() => {
        if (!isLoadingInitialMessages && !isLoadingOlderMessages && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            // Scroll to bottom if the last message is a temporary one (optimistic update)
            // OR if the user was already near the bottom.
            if ((lastMessage?.senderId === currentUser?.id && lastMessage?.tempId) || isNearBottom) {
                setTimeout(() => scrollToBottom(lastMessage?.tempId ? "auto" : "smooth"), 0);
            }
        }
    }, [messages, isLoadingInitialMessages, isLoadingOlderMessages, currentUser?.id, scrollToBottom, isNearBottom]);

    const handleNewMessage = useCallback((newMessage) => {
        if (selectedChat?.id && newMessage.chatId === selectedChat.id) {
            setMessages(prevMessages => {
                const existingTempMessageIndex = newMessage.tempId ? prevMessages.findIndex(msg => msg.tempId === newMessage.tempId) : -1;
                const existingRealMessage = prevMessages.find(msg => msg.id === newMessage.id && !msg.tempId);

                if (existingTempMessageIndex !== -1) {
                    const updatedMessages = [...prevMessages];
                    updatedMessages[existingTempMessageIndex] = {
                        ...newMessage,
                        tempId: undefined,
                    };
                    if (updatedMessages[existingTempMessageIndex].senderId === currentUser?.id && !updatedMessages[existingTempMessageIndex].deliveryStatus) {
                        updatedMessages[existingTempMessageIndex].deliveryStatus = 'sent';
                    }
                    return updatedMessages;
                } else if (!existingRealMessage) {
                    const messageToAdd = { ...newMessage };
                    if (messageToAdd.senderId === currentUser?.id && !messageToAdd.deliveryStatus) {
                        messageToAdd.deliveryStatus = 'sent';
                    }
                    return [...prevMessages, messageToAdd];
                }
                return prevMessages;
            });

            if (newMessage.senderId !== currentUser?.id) {
                socketService.markMessagesAsRead({chatId: selectedChat.id, lastSeenMessageId: newMessage.id});
                if (onMessagesMarkedAsRead) {
                    onMessagesMarkedAsRead(selectedChat.id);
                }
            }
        }
    }, [selectedChat?.id, currentUser?.id, onMessagesMarkedAsRead]);


    const handleTypingEvent = useCallback((typingData) => {
        if (selectedChat?.id && typingData.chatId === selectedChat.id && typingData.userId !== currentUser?.id) {
            setTypingUsers(prev => ({...prev, [typingData.userId]: typingData.isTyping}));
            if (typingData.isTyping) {
                setTimeout(() => {
                    setTypingUsers(currentTypingUsers => {
                        if (currentTypingUsers[typingData.userId]) {
                            return {...currentTypingUsers, [typingData.userId]: false };
                        }
                        return currentTypingUsers;
                    });
                }, 3000);
            }
        }
    }, [selectedChat?.id, currentUser?.id]);


    const handleMessageStatusUpdate = useCallback((statusUpdate) => {
        if (selectedChat?.id && statusUpdate.chatId === selectedChat.id) {
            setMessages(prevMessages => prevMessages.map(msg => {
                if (msg.senderId === currentUser?.id && msg.id === statusUpdate.messageId) {
                    const statusHierarchy = { sending: 0, sent: 1, delivered: 2, read: 3 };
                    const currentStatusValue = statusHierarchy[msg.deliveryStatus] || 0;
                    const newStatusValue = statusHierarchy[statusUpdate.status] || 0;

                    if (newStatusValue >= currentStatusValue) {
                        return {...msg, deliveryStatus: statusUpdate.status};
                    }
                }
                return msg;
            }));
        }
    }, [selectedChat?.id, currentUser?.id]);

    useEffect(() => {
        if (selectedChat?.id) {
            socketService.onNewMessage(handleNewMessage);
            socketService.onTyping(handleTypingEvent);
            socketService.onMessageStatusUpdate(handleMessageStatusUpdate);

            return () => {
                socketService.offNewMessage(handleNewMessage);
                socketService.offTyping(handleTypingEvent);
                socketService.offMessageStatusUpdate(handleMessageStatusUpdate);
                setTypingUsers({});
            };
        }
    }, [selectedChat?.id, handleNewMessage, handleTypingEvent, handleMessageStatusUpdate]);


    const handleSendMessage = (content) => {
        if (!selectedChat?.id || !content.trim() || !currentUser?.id) return;
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const messageData = {
            chatId: selectedChat.id,
            content: content.trim(),
            contentType: 'text',
            tempId: tempId,
        };

        const tempMessageObject = {
            id: tempId,
            chatId: selectedChat.id,
            content: content.trim(),
            contentType: 'text',
            senderId: currentUser.id,
            sender: {
                id: currentUser.id,
                username: currentUser.username,
                displayName: currentUser.displayName,
                profileImageUrl: currentUser.profileImageUrl,
            },
            createdAt: new Date().toISOString(),
            deliveryStatus: 'sending',
            tempId: tempId,
        };
        setMessages(prevMessages => [...prevMessages, tempMessageObject]);
        socketService.sendMessage(messageData);
    };

    const getChatDisplayInfo = useCallback(() => {
        if (!selectedChat) return {name: '', recipientId: null, avatarInitial: '', isGroup: false, members: [], profileImageUrl: null};

        if (selectedChat.type === 'private' && selectedChat.members) {
            const otherMember = selectedChat.members.find(m => m.id !== currentUser?.id);
            return {
                name: otherMember?.displayName || otherMember?.username || 'User',
                recipientId: otherMember?.id,
                avatarInitial: (otherMember?.displayName || otherMember?.username || 'U').charAt(0).toUpperCase(),
                profileImageUrl: otherMember?.profileImageUrl,
                isGroup: false,
                members: selectedChat.members
            };
        } else if (selectedChat.type === 'group') {
            return {
                name: selectedChat.name || 'Group Chat',
                recipientId: null,
                avatarInitial: null,
                profileImageUrl: selectedChat.groupImageUrl,
                isGroup: true,
                members: selectedChat.members || [],
                creatorId: selectedChat.creatorId
            };
        }
        return {name: 'Chat', recipientId: null, avatarInitial: '?', isGroup: false, members: [], profileImageUrl: null};
    }, [selectedChat, currentUser]);

    const displayInfo = getChatDisplayInfo();

    let statusOrMembersText = '';
    if (displayInfo.isGroup) {
        const onlineMembersCount = displayInfo.members.filter(m => userStatuses[m.id]?.status === 'online').length;
        statusOrMembersText = `${displayInfo.members.length} member${displayInfo.members.length !== 1 ? 's' : ''}`;
        if (onlineMembersCount > 0) {
            statusOrMembersText += `, ${onlineMembersCount} online`;
        }
    } else if (displayInfo.recipientId) {
        const recipientStatusInfo = userStatuses[displayInfo.recipientId];
        if (recipientStatusInfo?.status === 'online') {
            statusOrMembersText = 'online';
        } else if (recipientStatusInfo?.lastSeenAt) {
            const lastSeenDate = new Date(recipientStatusInfo.lastSeenAt);
            const now = new Date();
            if (lastSeenDate.toDateString() === now.toDateString()) {
                statusOrMembersText = `last seen today at ${lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else {
                statusOrMembersText = `last seen ${lastSeenDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
            }
        } else {
            statusOrMembersText = 'offline';
        }
    }

    const typingUserNames = Object.entries(typingUsers)
        .filter(([, isTyping]) => isTyping)
        .map(([userId]) => {
            const chatMember = selectedChat?.members?.find(m => m.id === userId);
            return chatMember?.displayName || chatMember?.username || 'Someone';
        })
        .slice(0, 2)
        .join(', ');

    const additionalTypingCount = Object.values(typingUsers).filter(isTyping => isTyping).length - 2;


    if (!selectedChat) {
        return (
            <div className="chat-window-placeholder" aria-label="Select a chat">
                <MessageSquareIcon />
                <p>Select a chat to start messaging</p>
                <p>Or search for users to begin a new conversation.</p>
            </div>
        );
    }

    return (
        <main className="chat-window-container" role="log" aria-live="polite">
            <header className="chat-window-header">
                <div
                    className="chat-header-avatar"
                    style={{backgroundColor: displayInfo.isGroup ? '#00796b' : (displayInfo.profileImageUrl ? 'transparent' : '#bdbdbd')}}
                    aria-hidden="true"
                >
                    {displayInfo.isGroup ?
                        (displayInfo.profileImageUrl ? <img src={displayInfo.profileImageUrl} alt={`${displayInfo.name} group icon`} /> : <UsersIcon />) :
                        (displayInfo.profileImageUrl ? <img src={displayInfo.profileImageUrl} alt={`${displayInfo.name} profile`} /> : displayInfo.avatarInitial)
                    }
                    {!displayInfo.isGroup && displayInfo.recipientId && userStatuses[displayInfo.recipientId]?.status === 'online' && (
                        <span className="header-status-dot online" title="Online"></span>
                    )}
                </div>
                <div className="chat-header-info">
                    <h3 aria-label={`Chat with ${displayInfo.name}`}>{displayInfo.name}</h3>
                    {statusOrMembersText && (
                        <span className={`chat-status-text ${displayInfo.isGroup ? 'group-info' : (userStatuses[displayInfo.recipientId]?.status || 'offline')}`}>
                            {statusOrMembersText}
                        </span>
                    )}
                </div>
            </header>

            <MessageList
                messages={messages}
                currentUser={currentUser}
                isLoadingInitial={isLoadingInitialMessages}
                isLoadingOlder={isLoadingOlderMessages}
                hasMoreMessages={hasMoreMessages}
                onLoadMore={() => loadMessages(selectedChat.id, currentPage + 1, true)}
                messagesListRef={messagesListRef}
                messagesEndRef={messagesEndRef}
            />

            {(typingUserNames || additionalTypingCount > 0) && (
                <div className="typing-indicator" aria-live="polite">
                    {typingUserNames}
                    {additionalTypingCount > 0 && ` and ${additionalTypingCount} more`}
                    {Object.values(typingUsers).filter(isTyping => isTyping).length > 1 ? ' are typing...' : ' is typing...'}
                </div>
            )}

            <MessageInput onSendMessage={handleSendMessage} chatId={selectedChat.id}/>
        </main>
    );
}

export default ChatWindow;
