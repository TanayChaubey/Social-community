import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Conversation document interface
 * Security: Participant validation and privacy controls
 * Privacy: Only participants can access conversations
 */
export interface IConversation extends Document {
  type: 'direct' | 'group';
  name?: string; // Group conversation name
  participants: Types.ObjectId[];
  adminId?: Types.ObjectId; // For group conversations
  lastMessage?: {
    content: string;
    senderId: Types.ObjectId;
    timestamp: Date;
    messageType: 'text' | 'image' | 'system';
  };
  isArchived: boolean;
  archivedBy: Types.ObjectId[];
  mutedBy: {
    userId: Types.ObjectId;
    until?: Date;
  }[];
  isReadBy: {
    userId: Types.ObjectId;
    readAt: Date;
  }[];
  metadata: {
    baseLocation?: string; // Base-specific conversations
    isOfficial?: boolean; // Official base announcements
  };
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addParticipant(userId: Types.ObjectId): Promise<void>;
  removeParticipant(userId: Types.ObjectId): Promise<void>;
  isParticipant(userId: Types.ObjectId): boolean;
  markAsRead(userId: Types.ObjectId): Promise<void>;
  muteUser(userId: Types.ObjectId, until?: Date): Promise<void>;
  unmuteUser(userId: Types.ObjectId): Promise<void>;
  isMutedBy(userId: Types.ObjectId): boolean;
  archive(userId: Types.ObjectId): Promise<void>;
  unarchive(userId: Types.ObjectId): Promise<void>;
  updateLastMessage(content: string, senderId: Types.ObjectId, messageType: 'text' | 'image' | 'system'): Promise<void>;
  canBeAccessedBy(userId: Types.ObjectId): boolean;
}

/**
 * Conversation schema with comprehensive security and privacy
 * Security: Participant validation, access controls
 * Privacy: User-controlled conversation settings
 */
const ConversationSchema = new Schema<IConversation>({
  type: {
    type: String,
    enum: {
      values: ['direct', 'group'],
      message: 'Conversation type must be direct or group'
    },
    required: [true, 'Conversation type is required']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [50, 'Conversation name cannot exceed 50 characters'],
    validate: {
      validator: function(this: IConversation, name: string) {
        // Name is required only for group conversations
        if (this.type === 'group') {
          return name && name.trim().length > 0;
        }
        return true;
      },
      message: 'Group conversations must have a name'
    }
  },
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: function(this: IConversation, adminId: Types.ObjectId) {
        // Admin is required for group conversations
        if (this.type === 'group') {
          return adminId && this.participants.includes(adminId);
        }
        return true;
      },
      message: 'Group conversations must have a valid admin'
    }
  },
  lastMessage: {
    content: {
      type: String,
      maxlength: [1000, 'Last message preview cannot exceed 1000 characters']
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'system'],
      default: 'text'
    }
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  mutedBy: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    until: {
      type: Date,
      // If no until date, mute is permanent
    }
  }],
  isReadBy: [{
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
  metadata: {
    baseLocation: {
      type: String,
      trim: true,
      maxlength: [100, 'Base location cannot exceed 100 characters']
    },
    isOfficial: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  // Performance and security indexes
  indexes: [
    { participants: 1 }, // Find conversations by user
    { updatedAt: -1 }, // Recent conversations
    { type: 1, createdAt: -1 }, // Conversation type filtering
    { 'mutedBy.userId': 1 }, // Muted conversations lookup
    { archivedBy: 1 }, // Archived conversations lookup
    { 'isReadBy.userId': 1 }, // Unread conversations lookup
    { 'metadata.baseLocation': 1 }, // Base-specific conversations
    { adminId: 1 } // Group conversations by admin
  ]
});

/**
 * Validation for minimum participants
 */
ConversationSchema.pre('save', function(next) {
  // Direct messages need exactly 2 participants
  if (this.type === 'direct' && this.participants.length !== 2) {
    return next(new Error('Direct conversations must have exactly 2 participants'));
  }

  // Group messages need at least 2 participants
  if (this.type === 'group' && this.participants.length < 2) {
    return next(new Error('Group conversations must have at least 2 participants'));
  }

  next();
});

/**
 * Method to add a participant to conversation
 * Security: Only group admins can add participants
 */
ConversationSchema.methods.addParticipant = async function(userId: Types.ObjectId): Promise<void> {
  if (this.type === 'direct') {
    throw new Error('Cannot add participants to direct conversations');
  }

  if (this.participants.includes(userId)) {
    throw new Error('User is already a participant');
  }

  this.participants.push(userId);
  await this.save();
};

/**
 * Method to remove a participant from conversation
 * Security: Only group admins or the participant themselves can remove
 */
ConversationSchema.methods.removeParticipant = async function(userId: Types.ObjectId): Promise<void> {
  if (this.type === 'direct') {
    throw new Error('Cannot remove participants from direct conversations');
  }

  if (!this.participants.includes(userId)) {
    throw new Error('User is not a participant');
  }

  // Cannot remove admin unless they're removing themselves
  if (this.adminId && this.adminId.equals(userId)) {
    // TODO: Transfer admin to another participant or disband group
    throw new Error('Admin cannot be removed from group conversation');
  }

  this.participants = this.participants.filter((id: Types.ObjectId) => !id.equals(userId));
  await this.save();
};

/**
 * Method to check if user is a participant
 */
ConversationSchema.methods.isParticipant = function(userId: Types.ObjectId): boolean {
  return this.participants.some((id: Types.ObjectId) => id.equals(userId));
};

/**
 * Method to mark conversation as read by user
 */
ConversationSchema.methods.markAsRead = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.isParticipant(userId)) {
    throw new Error('User is not a participant');
  }

  // Remove existing read receipt for this user
  this.isReadBy = this.isReadBy.filter((read: any) => !read.userId.equals(userId));

  // Add new read receipt
  this.isReadBy.push({
    userId,
    readAt: new Date()
  });

  await this.save();
};

/**
 * Method to mute conversation for user
 */
ConversationSchema.methods.muteUser = async function(userId: Types.ObjectId, until?: Date): Promise<void> {
  if (!this.isParticipant(userId)) {
    throw new Error('User is not a participant');
  }

  // Remove existing mute for this user
  this.mutedBy = this.mutedBy.filter((mute: any) => !mute.userId.equals(userId));

  // Add new mute
  this.mutedBy.push({
    userId,
    until
  });

  await this.save();
};

/**
 * Method to unmute conversation for user
 */
ConversationSchema.methods.unmuteUser = async function(userId: Types.ObjectId): Promise<void> {
  this.mutedBy = this.mutedBy.filter((mute: any) => !mute.userId.equals(userId));
  await this.save();
};

/**
 * Method to check if conversation is muted by user
 */
ConversationSchema.methods.isMutedBy = function(userId: Types.ObjectId): boolean {
  const userMute = this.mutedBy.find((mute: any) => mute.userId.equals(userId));

  if (!userMute) {
    return false;
  }

  // If there's an until date, check if it has expired
  if (userMute.until && userMute.until < new Date()) {
    return false;
  }

  return true;
};

/**
 * Method to archive conversation for user
 */
ConversationSchema.methods.archive = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.isParticipant(userId)) {
    throw new Error('User is not a participant');
  }

  if (!this.archivedBy.includes(userId)) {
    this.archivedBy.push(userId);
    await this.save();
  }
};

/**
 * Method to unarchive conversation for user
 */
ConversationSchema.methods.unarchive = async function(userId: Types.ObjectId): Promise<void> {
  this.archivedBy = this.archivedBy.filter((id: Types.ObjectId) => !id.equals(userId));
  await this.save();
};

/**
 * Method to update last message
 */
ConversationSchema.methods.updateLastMessage = async function(
  content: string,
  senderId: Types.ObjectId,
  messageType: 'text' | 'image' | 'system' = 'text'
): Promise<void> {
  this.lastMessage = {
    content,
    senderId,
    timestamp: new Date(),
    messageType
  };

  await this.save();
};

/**
 * Method to check if user can access conversation
 */
ConversationSchema.methods.canBeAccessedBy = function(userId: Types.ObjectId): boolean {
  return this.isParticipant(userId);
};

/**
 * Virtual for unread count (requires Messages model for actual count)
 */
ConversationSchema.virtual('unreadCount').get(function() {
  // This would need to be populated from the Messages model
  // For now, it's a placeholder
  return 0;
});

// Ensure virtuals are included in JSON output
ConversationSchema.set('toJSON', { virtuals: true });
ConversationSchema.set('toObject', { virtuals: true });

/**
 * Static method to find direct conversation between two users
 */
ConversationSchema.statics.findDirectConversation = function(user1Id: Types.ObjectId, user2Id: Types.ObjectId) {
  return this.findOne({
    type: 'direct',
    participants: { $all: [user1Id, user2Id], $size: 2 }
  }).populate('participants', 'username firstName lastName avatarUrl');
};

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);