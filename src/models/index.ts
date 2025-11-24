/**
 * Database models index
 * Exports all Mongoose models for easy importing
 * Security: All models include validation and security measures
 * Privacy: All models respect user privacy and data protection
 */

export { User, IUser } from './User';
export { Post, IPost } from './Post';
export { Conversation, IConversation } from './Conversation';
export { Message, IMessage } from './Message';
export { Notification, INotification } from './Notification';

// Re-export mongoose for convenience
export { Document, Types, Schema } from 'mongoose';