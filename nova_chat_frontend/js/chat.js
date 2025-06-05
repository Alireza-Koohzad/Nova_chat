// js/chat.js

let activeChatId = null;
let currentUser = null;
const chatListElement = document.getElementById('chatList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessageButton');
const activeChatNameElement = document.getElementById('activeChatName');
const activeChatStatusElement = document.getElementById('activeChatStatus');
const noChatSelectedElement = document.getElementById('noChatSelected');
const activeChatContainerElement = document.getElementById('activeChatContainer');
const typingIndicatorElement = document.getElementById('typingIndicator');

// برای جلوگیری از ارسال مکرر typing
let typingTimeout;
const TYPING_TIMER_LENGTH = 1500; // ms

async function initChatPage() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        handleLogout(); // اگر اطلاعات کاربر موجود نیست، لاگ اوت کن
        return;
    }
    document.getElementById('currentUserDisplay').textContent = `Logged in as: ${currentUser.displayName || currentUser.username}`;

    const token = getAuthToken();
    if (!token) {
        handleLogout();
        return;
    }
    initializeSocket(token); // راه‌اندازی سوکت

    await loadUserChats();
    setupSocketListeners();
    setupEventListeners();
}

function setupEventListeners() {
    if (sendMessageButton) {
        sendMessageButton.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }
    if (messageInput) {
        messageInput.addEventListener('input', handleTyping);
    }

    // جستجوی کاربر و شروع چت (ساده شده)
    const startChatButton = document.getElementById('startChatButton');
    const searchUserInput = document.getElementById('searchUserInput');
    if (startChatButton && searchUserInput) {
        // این بخش برای جستجوی کاربران و شروع چت جدید نیاز به پیاده‌سازی API دارد
        // فعلا یک placeholder می گذاریم
        // js/chat.js -> setupEventListeners
        searchUserInput.addEventListener('keyup', async (e) => {
            const query = e.target.value.trim();
            const searchResultsElement = document.getElementById('searchResults');
            searchResultsElement.innerHTML = '';
            if(query.length < 1) return; // تغییر به ۱ یا ۲ کاراکتر

            try {
                const response = await fetchWithAuth(`${API_BASE_URL}/users/search?q=${query}`);
                const result = await response.json(); // اسم متغیر را به result تغییر دادم که با users تداخل نکند
                if(result && result.success && result.data.length > 0) {
                    result.data.forEach(user => {
                        if(user.id === currentUser.id) return;
                        const div = document.createElement('div');
                        div.textContent = `${user.displayName || user.username} (@${user.username})`; // نمایش بهتر
                        div.dataset.userId = user.id;
                        div.dataset.userName = user.displayName || user.username; // برای استفاده در startNewPrivateChat
                        div.onclick = () => startNewPrivateChat(user.id, user.displayName || user.username);
                        searchResultsElement.appendChild(div);
                    });
                } else if (result && result.data.length === 0) {
                    searchResultsElement.textContent = 'No users found.';
                } else {
                    searchResultsElement.textContent = result.message || 'Error searching users.';
                }
            } catch (error) {
                console.error("Error searching users:", error);
                searchResultsElement.textContent = 'Error during search.';
            }
        });
    }
}

async function fetchWithAuth(url, options = {}) {
    const token = getAuthToken();
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) { // اگر توکن نامعتبر بود
        handleLogout();
        throw new Error('Unauthorized');
    }
    return response;
}


async function loadUserChats() {
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/chats`);
        const chats = await response.json();
        chatListElement.innerHTML = ''; // پاک کردن لیست قبلی
        if (Array.isArray(chats)) {
            chats.forEach(chat => displayChatItem(chat));
        }
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

function displayChatItem(chat) {
    const listItem = document.createElement('li');
    listItem.dataset.chatId = chat.id;
    listItem.dataset.chatType = chat.type;
    // برای چت خصوصی، اطلاعات کاربر دیگر را نگه می‌داریم
    if (chat.type === 'private' && chat.members) {
        const otherMember = chat.members.find(m => m.id !== currentUser.id);
        if (otherMember) {
            listItem.dataset.recipientId = otherMember.id;
            listItem.dataset.recipientName = otherMember.displayName || otherMember.username;
            listItem.dataset.recipientStatus = 'offline'; // وضعیت اولیه
        }
    }

    let chatDisplayName = chat.name; // نام گروه یا نام کاربر دیگر
    if (chat.type === 'private' && !chatDisplayName && chat.members) {
        const otherMember = chat.members.find(m => m.id !== currentUser.id);
        if(otherMember) chatDisplayName = otherMember.displayName || otherMember.username;
    }


    listItem.innerHTML = `
        <span>${chatDisplayName || 'Chat'}</span>
        ${chat.unreadCount > 0 ? `<span class="unread-count">${chat.unreadCount}</span>` : ''}
        <span class="user-status-indicator" data-user-id="${chat.type === 'private' ? listItem.dataset.recipientId : ''}" style="font-size:0.7em"></span>
    `;
    listItem.addEventListener('click', () => selectChat(chat.id, chatDisplayName, chat.type, listItem.dataset.recipientId));
    chatListElement.appendChild(listItem);
}

async function selectChat(chatId, chatName, chatType, recipientId) {
    if (activeChatId && window.socket) {
        window.socket.emit('leaveChat', activeChatId); // ترک چت قبلی
    }
    activeChatId = chatId;

    // هایلایت کردن چت فعال در لیست
    document.querySelectorAll('#chatList li').forEach(li => li.classList.remove('active-chat'));
    const currentChatLi = document.querySelector(`#chatList li[data-chat-id="${chatId}"]`);
    if (currentChatLi) currentChatLi.classList.add('active-chat');

    noChatSelectedElement.style.display = 'none';
    activeChatContainerElement.style.display = 'flex';
    activeChatNameElement.textContent = chatName || 'Chat';
    messagesContainer.innerHTML = ''; // پاک کردن پیام‌های قبلی

    if (window.socket) {
        window.socket.emit('joinChat', chatId); // پیوستن به چت جدید
    }

    // بارگذاری پیام‌های چت
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/chats/${chatId}/messages?limit=50`); // یا limit دلخواه
        const messages = await response.json();
        if (Array.isArray(messages)) {
            messages.forEach(msg => displayMessage(msg));
            scrollToBottom();
        }
        // علامت‌گذاری پیام‌ها به عنوان خوانده شده
        if (window.socket && messages.length > 0) {
            const lastMessage = messages[messages.length -1];
            window.socket.emit('markMessagesAsRead', { chatId, lastSeenMessageId: lastMessage.id });
            // آپدیت unreadCount در UI
            if (currentChatLi) {
                const unreadBadge = currentChatLi.querySelector('.unread-count');
                if (unreadBadge) unreadBadge.remove();
            }
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }

    // آپدیت وضعیت آنلاین/آفلاین کاربر مقابل (اگر چت خصوصی است)
    if (chatType === 'private' && recipientId) {
        updateRecipientStatus(recipientId); // این تابع باید وضعیت را از جایی (مثلا یک مپ از کاربران آنلاین) بگیرد
    } else {
        activeChatStatusElement.textContent = '';
        activeChatStatusElement.className = 'status-indicator';
    }
}

function updateRecipientStatus(recipientId) {
    // این تابع باید با توجه به رویداد userStatusChanged کار کند
    // فعلا یک placeholder
    const chatListItem = document.querySelector(`#chatList li[data-recipient-id="${recipientId}"]`);
    const userStatusIndicatorInChatList = chatListItem ? chatListItem.querySelector('.user-status-indicator') : null;

    if(window.userStatuses && window.userStatuses[recipientId]){
        const statusData = window.userStatuses[recipientId];
        activeChatStatusElement.textContent = statusData.status;
        activeChatStatusElement.className = `status-indicator ${statusData.status}`;
        if(userStatusIndicatorInChatList) {
            userStatusIndicatorInChatList.textContent = `(${statusData.status})`;
            userStatusIndicatorInChatList.className = `user-status-indicator ${statusData.status}`;
        }
    } else {
        activeChatStatusElement.textContent = 'offline';
        activeChatStatusElement.className = 'status-indicator offline';
        if(userStatusIndicatorInChatList) {
            userStatusIndicatorInChatList.textContent = '(offline)';
            userStatusIndicatorInChatList.className = `user-status-indicator offline`;
        }
    }
}


function displayMessage(message, isTemp = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(message.senderId === currentUser.id ? 'sent' : 'received');
    if(isTemp) messageElement.dataset.tempId = message.tempId; // برای پیام های موقت
    messageElement.dataset.messageId = message.id;


    let senderDisplayName = 'System';
    if (message.sender) {
        senderDisplayName = message.sender.displayName || message.sender.username;
    } else if (message.senderId === currentUser.id) {
        senderDisplayName = currentUser.displayName || currentUser.username;
    }
    // برای پیام های دریافتی، اگر اطلاعات فرستنده کامل نیست، باید از جایی گرفت
    // اما بک اند باید sender را در پیام include کند

    messageElement.innerHTML = `
        ${message.senderId !== currentUser.id ? `<span class="sender-name">${senderDisplayName}</span>` : ''}
        <p>${message.content}</p>
        <span class="timestamp">${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        ${message.senderId === currentUser.id ? `<span class="message-status-tick">✓</span>` : ''}
    `;
    messagesContainer.appendChild(messageElement);
    if(!isTemp) scrollToBottom(); // فقط برای پیام های نهایی اسکرول کن
}

function handleSendMessage() {
    const content = messageInput.value.trim();
    if (content && activeChatId && window.socket) {
        const tempId = `temp_${Date.now()}`; // شناسه موقت برای نمایش سریع پیام
        const tempMessage = {
            id: tempId, // از tempId به عنوان id موقت استفاده می کنیم
            tempId: tempId,
            chatId: activeChatId,
            senderId: currentUser.id,
            content: content,
            contentType: 'text',
            createdAt: new Date().toISOString(), // زمان فعلی برای نمایش
            sender: { id: currentUser.id, displayName: currentUser.displayName, username: currentUser.username } // اطلاعات فرستنده برای نمایش
        };
        displayMessage(tempMessage, true); // نمایش پیام به صورت موقت
        scrollToBottom(); // اسکرول پس از نمایش موقت

        window.socket.emit('sendMessage', { chatId: activeChatId, content, tempId });
        messageInput.value = '';
        // توقف ارسال typing
        if (typingTimeout) clearTimeout(typingTimeout);
        window.socket.emit('typing', { chatId: activeChatId, isTyping: false });
    }
}

function handleTyping() {
    if (!activeChatId || !window.socket) return;

    if (!typingTimeout) { // اگر تایمر فعال نیست، یعنی شروع به تایپ کرده
        window.socket.emit('typing', { chatId: activeChatId, isTyping: true });
    } else { // اگر تایمر فعال است، ریستش کن
        clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
        window.socket.emit('typing', { chatId: activeChatId, isTyping: false });
        typingTimeout = null; // ریست کردن تایمر
    }, TYPING_TIMER_LENGTH);
}


function setupSocketListeners() {
    if (!window.socket) return;
    window.userStatuses = {}; // برای نگهداری وضعیت کاربران

    window.socket.on('newMessage', (message) => {
        // اگر پیام برای چت فعال است، نمایش بده
        // و اگر پیام موقت با tempId وجود داشت، آن را با پیام واقعی جایگزین یا آپدیت کن
        const tempMessageElement = message.tempId ? document.querySelector(`.message[data-temp-id="${message.tempId}"]`) : null;

        if (tempMessageElement) { // پیام از طرف خودمان بود و حالا تاییدیه سرور آمده
            tempMessageElement.dataset.messageId = message.id; // آپدیت ID اصلی
            tempMessageElement.removeAttribute('data-temp-id');
            // می توانید وضعیت تیک را اینجا به "ارسال شده" تغییر دهید
            const tickElement = tempMessageElement.querySelector('.message-status-tick');
            if(tickElement) tickElement.textContent = '✓'; // تک تیک (ارسال به سرور)
        } else if (message.chatId === activeChatId) { // پیام جدید از دیگران
            displayMessage(message);
            // اگر چت فعال است و پیام از دیگری است، آن را بخوان
            window.socket.emit('markMessagesAsRead', { chatId: activeChatId, lastSeenMessageId: message.id });
        } else {
            // اگر پیام برای چت دیگری است، unread count را آپدیت کن
            const chatListItem = document.querySelector(`#chatList li[data-chat-id="${message.chatId}"]`);
            if (chatListItem) {
                let unreadBadge = chatListItem.querySelector('.unread-count');
                if (!unreadBadge) {
                    unreadBadge = document.createElement('span');
                    unreadBadge.classList.add('unread-count');
                    chatListItem.appendChild(unreadBadge); // یا در جای مناسب‌تری
                }
                unreadBadge.textContent = parseInt(unreadBadge.textContent || '0') + 1;
            }
        }
        // آپدیت آخرین پیام در لیست چت ها
        const chatListItemToUpdate = document.querySelector(`#chatList li[data-chat-id="${message.chatId}"]`);
        if (chatListItemToUpdate) {
            // اینجا می توانید متن آخرین پیام را هم در لیست چت ها نمایش دهید (نیاز به تغییر displayChatItem دارد)
            // و چت را به بالای لیست منتقل کنید (نیاز به مرتب سازی مجدد یا prepend دارد)
        }
    });

    window.socket.on('typing', (data) => {
        // data: { userId: string, chatId: string, isTyping: boolean }
        if (data.chatId === activeChatId && data.userId !== currentUser.id) {
            typingIndicatorElement.textContent = data.isTyping ? `User ${data.userId.substring(0,6)}... is typing...` : '';
            // بهتر است به جای userId، نام کاربر را نمایش دهیم (نیاز به نگهداری مپ userId به نام کاربر)
        }
    });

    window.socket.on('messageStatusUpdate', (data) => {
        // data: { messageId: string, chatId: string, status: 'delivered' | 'read', recipientId: string }
        if (data.chatId === activeChatId) {
            const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                const tickElement = messageElement.querySelector('.message-status-tick');
                if (tickElement) {
                    if (data.status === 'delivered') tickElement.textContent = '✓✓'; // دو تیک خاکستری
                    // برای read باید منطق دیگری داشته باشیم چون ممکن است چندین گیرنده داشته باشیم (برای گروه)
                    // یا اگر چت خصوصی است و data.recipientId همان کاربر مقابل است
                }
            }
        }
    });

    window.socket.on('messagesReadByRecipient', (data) => {
        // data: { chatId: string, readerId: string, lastReadMessageId: string }
        if (data.chatId === activeChatId && data.readerId !== currentUser.id) {
            // تمام پیام های ارسال شده توسط currentUser که ID آنها کوچکتر یا مساوی lastReadMessageId است را تیک آبی بزن
            document.querySelectorAll(`.message.sent[data-message-id]`).forEach(msgEl => {
                // این مقایسه ID برای UUID ها ممکن است دقیق نباشد اگر ترتیب زمانی نداشته باشند
                // بهتر است یک timestamp هم برای پیام ها داشته باشیم یا همه پیام های تا آن لحظه را آپدیت کنیم
                // برای سادگی، فرض می کنیم همه پیام های قبلی خوانده شده اند
                const tick = msgEl.querySelector('.message-status-tick');
                if (tick) tick.style.color = 'blue'; // تیک آبی
            });
            console.log(`User ${data.readerId} read messages up to ${data.lastReadMessageId} in chat ${data.chatId}`);
        }
    });

    window.socket.on('userStatusChanged', (data) => {
        // data: { userId: string, status: 'online' | 'offline', lastSeenAt: Date }
        console.log('User status changed:', data);
        window.userStatuses[data.userId] = data; // ذخیره وضعیت

        // آپدیت UI در لیست چت ها
        const chatListItem = document.querySelector(`#chatList li[data-recipient-id="${data.userId}"]`);
        if (chatListItem) {
            const statusIndicator = chatListItem.querySelector('.user-status-indicator');
            if (statusIndicator) {
                statusIndicator.textContent = `(${data.status})`;
                statusIndicator.className = `user-status-indicator ${data.status}`;
            }
        }
        // آپدیت UI در هدر چت فعال
        if (activeChatId) {
            const currentChatLi = document.querySelector(`#chatList li[data-chat-id="${activeChatId}"]`);
            if (currentChatLi && currentChatLi.dataset.recipientId === data.userId) {
                activeChatStatusElement.textContent = data.status;
                activeChatStatusElement.className = `status-indicator ${data.status}`;
            }
        }
    });

}

function scrollToBottom() {
    if(messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// تابع برای شروع چت جدید (ساده شده)
async function startNewPrivateChat(recipientId, recipientName) { // recipientName اضافه شد
    if (recipientId === currentUser.id) {
        alert("You cannot chat with yourself.");
        return;
    }
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/chats/private/${recipientId}`, { method: 'POST' });
        const chatData = await response.json();
        if (chatData && chatData.id) {
            let existingChatItem = document.querySelector(`#chatList li[data-chat-id="${chatData.id}"]`);
            if (!existingChatItem) {
                // اگر بک‌اند اطلاعات members را در پاسخ createOrGetPrivateChat برمی‌گرداند، از آن استفاده کن
                // در غیر این صورت، recipientName که از جستجو آمده را استفاده کن
                if (!chatData.name && chatData.type === 'private') { // اگر نام چت در پاسخ نبود
                    chatData.name = recipientName; // از نامی که از جستجو گرفتیم استفاده کن
                }
                if(!chatData.members && chatData.type === 'private'){
                    const selfUser = {id: currentUser.id, displayName: currentUser.displayName, username: currentUser.username};
                    const recipient = {id: recipientId, displayName: recipientName, username: recipientName}; // ساختار ساده
                    chatData.members = [selfUser, recipient];
                }
                displayChatItem(chatData); // این تابع باید بتواند با این ساختار کار کند
                existingChatItem = document.querySelector(`#chatList li[data-chat-id="${chatData.id}"]`);
            }
            if(existingChatItem) existingChatItem.click();
            document.getElementById('searchUserInput').value = '';
            document.getElementById('searchResults').innerHTML = '';
        } else {
            alert("Could not start chat. " + (chatData.message || 'Unknown error'));
        }
    } catch (error) {
        console.error("Error starting new chat:", error);
        alert("Error starting new chat.");
    }
}
// ... سایر توابع کمکی