// src/models/associations.js
const User = require('./User');
const Chat = require('./Chat');
const Message = require('./Message');
const ChatMember = require('./ChatMember');

function defineAssociations() {
    // User and Chat (Many-to-Many through ChatMember)
    User.belongsToMany(Chat, {
        through: ChatMember,
        foreignKey: 'userId',
        otherKey: 'chatId',
        as: 'memberInChats', // User.getChats(), User.addChat()
    });
    Chat.belongsToMany(User, {
        through: ChatMember,
        foreignKey: 'chatId',
        otherKey: 'userId',
        as: 'members', // Chat.getMembers(), Chat.addMember()
    });

    // ChatMember relationships
    ChatMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    ChatMember.belongsTo(Chat, { foreignKey: 'chatId', as: 'chat' });

    // Chat and Message (One-to-Many)
    Chat.hasMany(Message, {
        foreignKey: 'chatId',
        as: 'messages', // Chat.getMessages(), Chat.createMessage()
        onDelete: 'CASCADE', // اگر چت حذف شد، پیام‌هایش هم حذف شوند
    });
    Message.belongsTo(Chat, { foreignKey: 'chatId', as: 'chat' });

    // User and Message (One-to-Many - Sender)
    User.hasMany(Message, {
        foreignKey: 'senderId',
        as: 'sentMessages', // User.getSentMessages()
        onDelete: 'SET NULL', // اگر فرستنده حذف شد، پیام باقی بماند ولی senderId آن null شود
    });
    Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });

    // Chat and Creator (One-to-Many, for group chats)
    User.hasMany(Chat, {
        foreignKey: 'creatorId',
        as: 'createdChats'
    });
    Chat.belongsTo(User, {
        foreignKey: 'creatorId',
        as: 'creator'
    });

    // Chat and LastMessage (One-to-One) - اختیاری، برای راحتی
    // Message.hasOne(Chat, { foreignKey: 'lastMessageId', as: 'chatAsLastMessage'}); // این رابطه برعکس است
    Chat.belongsTo(Message, { foreignKey: 'lastMessageId', as: 'lastMessage', constraints: false }); // constraints: false چون ممکن است در ابتدا lastMessageId وجود نداشته باشد

    // ChatMember and LastReadMessage (One-to-One) - اختیاری
    ChatMember.belongsTo(Message, { foreignKey: 'lastReadMessageId', as: 'lastReadMessage', constraints: false });

    Chat.hasMany(ChatMember, { foreignKey: 'chatId', as: 'ChatMembersData' });

    console.log("Sequelize associations defined.");
}

module.exports = defineAssociations;