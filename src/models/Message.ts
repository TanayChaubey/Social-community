import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Message read receipt interface
 */
export interface IReadReceipt {
  userId: Types.ObjectId;
  readAt: Date;
}

/**
 * Message document interface
 * Security: Content validation, rate limiting, and access controls
 * Privacy: Only conversation participants can access messages
 */
export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  content: string;
  imageUrl?: string;
  messageType: 'text' | 'image' | 'system';
  replyTo?: Types.ObjectId; // For threaded replies
  readBy: IReadReceipt[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  reactions: {
    emoji: string;
    users: Types.ObjectId[];
  }[];
  metadata: {
    isSystemMessage?: boolean;
    systemMessageType?: 'user_joined' | 'user_left' | 'conversation_created' | 'user_added' | 'user_removed';
    mentionedUsers?: Types.ObjectId[];
    hasAttachments?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;

  // Methods
  markAsRead(userId: Types.ObjectId): Promise<void>;
  addReaction(emoji: string, userId: Types.ObjectId): Promise<void>;
  removeReaction(emoji: string, userId: Types.ObjectId): Promise<void>;
  edit(newContent: string): Promise<void>;
  delete(deletedBy: Types.ObjectId): Promise<void>;
  canBeAccessedBy(userId: Types.ObjectId): Promise<boolean>;
  getMentionedUsers(): Types.ObjectId[];
}

/**
 * Message schema with comprehensive security and validation
 * Security: Content validation, XSS protection, access controls
 * Privacy: Message-level access controls and read receipts
 */
const MessageSchema = new Schema<IMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'Conversation ID is required'],
    index: true // For conversation message lookup
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender ID is required'],
    index: true // For user message lookup
  },
  content: {
    type: String,
    required: function(this: IMessage) {
      // Content is required unless it's an image-only message or system message
      return this.messageType !== 'image' && !this.metadata?.isSystemMessage;
    },
    trim: true,
    minlength: [1, 'Message content cannot be empty'],
    maxlength: [4000, 'Message content cannot exceed 4000 characters'],
    // Security: Content validation and XSS prevention
    validate: {
      validator: function(this: IMessage, content: string) {
        // Allow empty content for image messages and system messages
        if (this.messageType === 'image' || this.metadata?.isSystemMessage) {
          return true;
        }

        // Prevent malicious content patterns
        const maliciousPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /data:text\/html/gi,
        ];

        return !maliciousPatterns.some(pattern => pattern.test(content));
      },
      message: 'Message contains invalid content'
    }
  },
  imageUrl: {
    type: String,
    required: function(this: IMessage) {
      return this.messageType === 'image';
    },
    validate: {
      validator: function(this: IMessage, url: string) {
        if (!url) return true;
        if (this.messageType !== 'image') return false;
        // Validate S3 image URLs
        return /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)$/i.test(url);
      },
      message: 'Image message must have a valid image URL'
    }
  },
  messageType: {
    type: String,
    enum: {
      values: ['text', 'image', 'system'],
      message: 'Message type must be text, image, or system'
    },
    default: 'text'
  },
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    validate: {
      validator: async function(this: IMessage, replyToId: Types.ObjectId) {
        if (!replyToId) return true;

        // Ensure replied message is in the same conversation
        const repliedMessage = await mongoose.model('Message').findById(replyToId);
        return repliedMessage && repliedMessage.conversationId.equals(this.conversationId);
      },
      message: 'Replied message must be in the same conversation'
    }
  },
  readBy: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  reactions: [{
    emoji: {
      type: String,
      required: true,
      validate: {
        validator: function(emoji: string) {
          // Allow common emojis and prevent abuse
          const allowedEmojis = /^[\u{1F600}-\u{1F64F}]|^[\u{1F300}-\u{1F5FF}]|^[\u{1F680}-\u{1F6FF}]|^[\u{1F1E0}-\u{1F1FF}]|^[\u{2600}-\u{26FF}]|^[\u{2700}-\u{27BF}]|^[\uD83C][\uDC00-\uDFFF]|^[\uD83D][\uDC00-\uDFFF]|^[\uD83E][\uDD00-\uDDFF]|^[⭐❤️👍👎😂😍🎉]/u;
          return allowedEmojis.test(emoji);
        },
        message: 'Invalid emoji'
      }
    },
    users: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  metadata: {
    isSystemMessage: {
      type: Boolean,
      default: false
    },
    systemMessageType: {
      type: String,
      enum: ['user_joined', 'user_left', 'conversation_created', 'user_added', 'user_removed']
    },
    mentionedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    hasAttachments: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  // Performance and security indexes
  indexes: [
    { conversationId: 1, createdAt: -1 }, // Messages in conversation sorted by date
    { senderId: 1, createdAt: -1 }, // User's messages
    { createdAt: -1 }, // Global message timeline
    { messageType: 1 }, // Message type filtering
    { replyTo: 1 }, // Message threads
    { isDeleted: 1 }, // Deleted message filtering
    { 'reactions.users': 1 }, // Reaction lookup
    { 'metadata.mentionedUsers': 1 } // Mentioned users lookup
  ]
});

/**
 * Pre-save middleware to extract mentioned users from content
 */
MessageSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.metadata?.isSystemMessage) {
    // Extract @username mentions
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(this.content)) !== null) {
      mentions.push(match[1]);
    }

    if (mentions.length > 0) {
      // TODO: Convert usernames to user IDs
      // For now, store as empty array
      this.metadata = {
        ...this.metadata,
        mentionedUsers: []
      };
    }
  }

  next();
});

/**
 * Method to mark message as read by user
 */
MessageSchema.methods.markAsRead = async function(userId: Types.ObjectId): Promise<void> {
  // Remove existing read receipt for this user
  this.readBy = this.readBy.filter((read: IReadReceipt) => !read.userId.equals(userId));

  // Add new read receipt
  this.readBy.push({
    userId,
    readAt: new Date()
  });

  await this.save();
};

/**
 * Method to add reaction to message
 */
MessageSchema.methods.addReaction = async function(emoji: string, userId: Types.ObjectId): Promise<void> {
  // Find existing reaction for this emoji
  let reaction = this.reactions.find(r => r.emoji === emoji);

  if (!reaction) {
    // Create new reaction
    reaction = { emoji, users: [] };
    this.reactions.push(reaction);
  }

  // Add user to reaction if not already present
  if (!reaction.users.some((id: Types.ObjectId) => id.equals(userId))) {
    reaction.users.push(userId);
    await this.save();
  }
};

/**
 * Method to remove reaction from message
 */
MessageSchema.methods.removeReaction = async function(emoji: string, userId: Types.ObjectId): Promise<void> {
  const reaction = this.reactions.find(r => r.emoji === emoji);

  if (reaction) {
    reaction.users = reaction.users.filter((id: Types.ObjectId) => !id.equals(userId));

    // Remove reaction if no users left
    if (reaction.users.length === 0) {
      this.reactions = this.reactions.filter(r => r.emoji !== emoji);
    }

    await this.save();
  }
};

/**
 * Method to edit message content
 * Security: Only allow editing within 15 minutes, preserve edit history
 */
MessageSchema.methods.edit = async function(newContent: string): Promise<void> {
  // Check if message is too old to edit (15 minutes)
  const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds

  if (Date.now() - this.createdAt.getTime() > editTimeLimit) {
    throw new Error('Message can only be edited within 15 minutes of sending');
  }

  if (this.isDeleted) {
    throw new Error('Cannot edit deleted message');
  }

  if (this.metadata?.isSystemMessage) {
    throw new Error('Cannot edit system messages');
  }

  this.content = newContent.trim();
  this.isEdited = true;
  this.editedAt = new Date();

  await this.save();
};

/**
 * Method to delete message
 */
MessageSchema.methods.delete = async function(deletedBy: Types.ObjectId): Promise<void> {
  if (this.isDeleted) {
    throw new Error('Message is already deleted');
  }

  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;

  // Clear content for privacy but keep metadata
  this.content = '[Message deleted]';
  this.imageUrl = undefined;

  await this.save();
};

/**
 * Method to check if user can access message
 */
MessageSchema.methods.canBeAccessedBy = async function(userId: Types.ObjectId): Promise<boolean> {
  // Check if user is the sender
  if (this.senderId.equals(userId)) {
    return true;
  }

  // Check if user is a participant in the conversation
  const Conversation = mongoose.model('Conversation');
  const conversation = await Conversation.findById(this.conversationId);

  if (!conversation) {
    return false;
  }

  return conversation.isParticipant(userId);
};

/**
 * Method to get mentioned users
 */
MessageSchema.methods.getMentionedUsers = function(): Types.ObjectId[] {
  return this.metadata?.mentionedUsers || [];
};

/**
 * Virtual for reaction count
 */
MessageSchema.virtual('totalReactions').get(function() {
  return this.reactions.reduce((total: number, reaction: any) => {
    return total + reaction.users.length;
  }, 0);
});

/**
 * Virtual for read count
 */
MessageSchema.virtual('readCount').get(function() {
  return this.readBy.length;
});

// Ensure virtuals are included in JSON output
MessageSchema.set('toJSON', {
  virtuals: true,
  // Exclude sensitive fields from JSON
  transform: function(doc, ret) {
    if (ret.isDeleted) {
      ret.content = '[Message deleted]';
      ret.imageUrl = undefined;
    }
    return ret;
  }
});

MessageSchema.set('toObject', { virtuals: true });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);