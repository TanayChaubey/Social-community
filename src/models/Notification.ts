import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Notification document interface
 * Security: Content validation and privacy controls
 * Privacy: User-specific notifications with access controls
 */
export interface INotification extends Document {
  recipientId: Types.ObjectId;
  senderId?: Types.ObjectId; // Optional, for user-generated notifications
  type: 'like' | 'comment' | 'follow' | 'message' | 'mention' | 'system' | 'moderation' | 'post_approved' | 'post_rejected';
  title: string;
  message: string;
  data: {
    postId?: Types.ObjectId;
    commentId?: Types.ObjectId;
    conversationId?: Types.ObjectId;
    messageId?: Types.ObjectId;
    userId?: Types.ObjectId;
    [key: string]: any; // Additional metadata
  };
  isRead: boolean;
  readAt?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl?: string; // Deep link for the notification
  expiresAt?: Date; // Auto-deletion for temporary notifications
  isEmailSent: boolean;
  emailSentAt?: Date;
  metadata: {
    category?: string;
    tags?: string[];
    source?: 'web' | 'mobile' | 'api' | 'system';
    batchId?: string; // For grouping similar notifications
  };
  createdAt: Date;
  updatedAt: Date;

  // Methods
  markAsRead(): Promise<void>;
  isExpired(): boolean;
  canBeAccessedBy(userId: Types.ObjectId): boolean;
  getActionUrl(): string;
}

/**
 * Notification schema with comprehensive security and privacy
 * Security: Content validation, access controls, rate limiting
 * Privacy: User-specific notifications with auto-cleanup
 */
const NotificationSchema = new Schema<INotification>({
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Notification recipient is required'],
    index: true // For user notification lookup
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true // For sender-based queries
  },
  type: {
    type: String,
    enum: {
      values: ['like', 'comment', 'follow', 'message', 'mention', 'system', 'moderation', 'post_approved', 'post_rejected'],
      message: 'Invalid notification type'
    },
    required: [true, 'Notification type is required']
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    minlength: [1, 'Notification title cannot be empty'],
    maxlength: [100, 'Notification title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    minlength: [1, 'Notification message cannot be empty'],
    maxlength: [500, 'Notification message cannot exceed 500 characters'],
    // Security: Content validation
    validate: {
      validator: function(message: string) {
        // Prevent malicious content
        const maliciousPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
        ];

        return !maliciousPatterns.some(pattern => pattern.test(message));
      },
      message: 'Notification message contains invalid content'
    }
  },
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true // For unread notification queries
  },
  readAt: {
    type: Date
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Invalid notification priority'
    },
    default: 'medium',
    index: true // For priority-based sorting
  },
  actionUrl: {
    type: String,
    validate: {
      validator: function(url: string) {
        if (!url) return true;
        // Allow relative URLs and specific domains
        return /^\/[\w\-\/]*$|^https?:\/\/localhost(:\d+)?(\/[\w\-\/]*)?$/.test(url);
      },
      message: 'Invalid action URL format'
    }
  },
  expiresAt: {
    type: Date,
    index: true // For auto-cleanup of expired notifications
  },
  isEmailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  },
  metadata: {
    category: {
      type: String,
      trim: true,
      maxlength: [50, 'Category cannot exceed 50 characters']
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: [20, 'Tag cannot exceed 20 characters']
    }],
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'system'],
      default: 'web'
    },
    batchId: {
      type: String,
      trim: true
    }
  }
}, {
  timestamps: true,
  // Performance and security indexes
  indexes: [
    { recipientId: -1, createdAt: -1 }, // User's notifications sorted by date
    { recipientId: -1, isRead: 1, createdAt: -1 }, // Unread notifications for user
    { recipientId: -1, priority: -1, createdAt: -1 }, // Priority notifications
    { type: 1, createdAt: -1 }, // Notification type filtering
    { senderId: 1, createdAt: -1 }, // Notifications from specific user
    { expiresAt: 1 }, // Expired notifications cleanup
    { 'metadata.batchId': 1 }, // Batch notification grouping
    { createdAt: -1 } // Global notification timeline
  ]
});

/**
 * Pre-save middleware to set expiration for certain notification types
 */
NotificationSchema.pre('save', function(next) {
  // Auto-expire temporary notifications
  const temporaryTypes = ['system'];
  const autoExpireHours = 24; // 24 hours for temporary notifications

  if (temporaryTypes.includes(this.type) && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + (autoExpireHours * 60 * 60 * 1000));
  }

  next();
});

/**
 * Method to mark notification as read
 */
NotificationSchema.methods.markAsRead = async function(): Promise<void> {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
};

/**
 * Method to check if notification is expired
 */
NotificationSchema.methods.isExpired = function(): boolean {
  return this.expiresAt ? this.expiresAt < new Date() : false;
};

/**
 * Method to check if user can access notification
 */
NotificationSchema.methods.canBeAccessedBy = function(userId: Types.ObjectId): boolean {
  return this.recipientId.equals(userId);
};

/**
 * Method to get action URL with fallback
 */
NotificationSchema.methods.getActionUrl = function(): string {
  if (this.actionUrl) {
    return this.actionUrl;
  }

  // Generate default action URLs based on notification type
  switch (this.type) {
    case 'like':
    case 'comment':
      if (this.data.postId) {
        return `/post/${this.data.postId}`;
      }
      break;
    case 'message':
      if (this.data.conversationId) {
        return `/chat/${this.data.conversationId}`;
      }
      break;
    case 'follow':
      if (this.data.userId) {
        return `/profile/${this.data.userId}`;
      }
      break;
    case 'mention':
      if (this.data.postId) {
        return `/post/${this.data.postId}`;
      }
      break;
    case 'moderation':
      return '/admin/moderation';
    case 'post_approved':
    case 'post_rejected':
      if (this.data.postId) {
        return `/post/${this.data.postId}`;
      }
      break;
    default:
      return '/notifications';
  }

  return '/notifications';
};

/**
 * Virtual for notification age
 */
NotificationSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

/**
 * Virtual for formatted age
 */
NotificationSchema.virtual('formattedAge').get(function() {
  const age = this.age;
  const minutes = Math.floor(age / (1000 * 60));
  const hours = Math.floor(age / (1000 * 60 * 60));
  const days = Math.floor(age / (1000 * 60 * 60 * 24));

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Ensure virtuals are included in JSON output
NotificationSchema.set('toJSON', { virtuals: true });
NotificationSchema.set('toObject', { virtuals: true });

/**
 * Static method to create notification for user
 */
NotificationSchema.statics.createNotification = async function(
  recipientId: Types.ObjectId,
  type: string,
  title: string,
  message: string,
  data: any = {},
  senderId?: Types.ObjectId
) {
  const notification = new this({
    recipientId,
    senderId,
    type,
    title,
    message,
    data
  });

  return await notification.save();
};

/**
 * Static method to get unread count for user
 */
NotificationSchema.statics.getUnreadCount = function(userId: Types.ObjectId) {
  return this.countDocuments({
    recipientId: userId,
    isRead: false,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

/**
 * Static method to mark all as read for user
 */
NotificationSchema.statics.markAllAsRead = function(userId: Types.ObjectId) {
  return this.updateMany(
    {
      recipientId: userId,
      isRead: false
    },
    {
      isRead: true,
      readAt: new Date()
    }
  );
};

/**
 * Static method to cleanup expired notifications
 */
NotificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);