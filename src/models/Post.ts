import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Comment sub-document interface
 */
export interface IComment {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Post document interface
 * Security: Content validation and privacy controls
 * Privacy: User-controlled visibility settings
 */
export interface IPost extends Document {
  content: string;
  imageUrl?: string;
  authorId: Types.ObjectId;
  visibility: 'public' | 'friends' | 'private';
  likes: Types.ObjectId[];
  comments: IComment[];
  tags: string[]; // For content categorization and filtering
  isEdited: boolean;
  editedAt?: Date;
  reportedBy: Types.ObjectId[]; // Users who reported this post
  isModerated: boolean;
  moderatedBy?: Types.ObjectId;
  moderatedReason?: string;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addLike(userId: Types.ObjectId): Promise<void>;
  removeLike(userId: Types.ObjectId): Promise<void>;
  addComment(authorId: Types.ObjectId, content: string): Promise<void>;
  removeComment(commentId: Types.ObjectId, userId: Types.ObjectId): Promise<void>;
  isLikedBy(userId: Types.ObjectId): boolean;
  canBeViewedBy(userId?: Types.ObjectId): Promise<boolean>;
  report(userId: Types.ObjectId): Promise<void>;
}

/**
 * Comment schema with validation and security
 */
const CommentSchema = new Schema<IComment>({
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment author is required']
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    minlength: [1, 'Comment cannot be empty'],
    maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    // Security: Basic content sanitization
    validate: {
      validator: function(content: string) {
        // Prevent malicious content patterns
        const maliciousPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
        ];

        return !maliciousPatterns.some(pattern => pattern.test(content));
      },
      message: 'Comment contains invalid content'
    }
  }
}, {
  timestamps: true
});

/**
 * Post schema with comprehensive security and privacy features
 * Security: Content validation, XSS protection, reporting system
 * Privacy: Visibility controls, user data protection
 */
const PostSchema = new Schema<IPost>({
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    minlength: [1, 'Post cannot be empty'],
    maxlength: [2000, 'Post cannot exceed 2000 characters'],
    // Security: Content validation and XSS prevention
    validate: {
      validator: function(content: string) {
        // Prevent malicious content patterns
        const maliciousPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /data:text\/html/gi,
        ];

        return !maliciousPatterns.some(pattern => pattern.test(content));
      },
      message: 'Post contains invalid content'
    }
  },
  imageUrl: {
    type: String,
    validate: {
      validator: function(url: string) {
        if (!url) return true;
        // Validate S3 image URLs
        return /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
      },
      message: 'Image URL must be a valid image URL'
    }
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Post author is required'],
    index: true // For user's posts lookup
  },
  visibility: {
    type: String,
    enum: {
      values: ['public', 'friends', 'private'],
      message: 'Visibility must be public, friends, or private'
    },
    default: 'public'
  },
  likes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [CommentSchema],
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [20, 'Tag cannot exceed 20 characters'],
    validate: {
      validator: function(tag: string) {
        // Alphanumeric and hyphens only
        return /^[a-z0-9-]+$/.test(tag);
      },
      message: 'Tag can only contain lowercase letters, numbers, and hyphens'
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  reportedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  isModerated: {
    type: Boolean,
    default: false
  },
  moderatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedReason: {
    type: String,
    maxlength: [500, 'Moderation reason cannot exceed 500 characters']
  }
}, {
  timestamps: true,
  // Performance and security indexes
  indexes: [
    { authorId: -1, createdAt: -1 }, // User's posts sorted by date
    { createdAt: -1 }, // General feed sorted by date
    { visibility: 1, createdAt: -1 }, // Public posts feed
    { tags: 1 }, // Tag-based search
    { 'comments.authorId': 1 }, // User's comments lookup
    { likes: 1 }, // User's liked posts
    { reportedBy: 1 }, // Reported posts for moderation
    { isModerated: 1, createdAt: -1 } // Moderation queue
  ]
});

/**
 * Method to add a like to the post
 * Security: Prevent duplicate likes
 */
PostSchema.methods.addLike = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.likes.includes(userId)) {
    this.likes.push(userId);
    await this.save();
  }
};

/**
 * Method to remove a like from the post
 */
PostSchema.methods.removeLike = async function(userId: Types.ObjectId): Promise<void> {
  this.likes = this.likes.filter((id: Types.ObjectId) => !id.equals(userId));
  await this.save();
};

/**
 * Method to check if user liked the post
 */
PostSchema.methods.isLikedBy = function(userId: Types.ObjectId): boolean {
  return this.likes.some((id: Types.ObjectId) => id.equals(userId));
};

/**
 * Method to add a comment to the post
 * Security: Content validation, rate limiting should be handled at API level
 */
PostSchema.methods.addComment = async function(authorId: Types.ObjectId, content: string): Promise<void> {
  const comment = {
    authorId,
    content: content.trim(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  this.comments.push(comment);
  await this.save();
};

/**
 * Method to remove a comment
 * Security: Only comment author or post author can remove
 */
PostSchema.methods.removeComment = async function(commentId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
  const comment = this.comments.id(commentId);

  if (!comment) {
    throw new Error('Comment not found');
  }

  // Check if user is comment author or post author
  if (!comment.authorId.equals(userId) && !this.authorId.equals(userId)) {
    throw new Error('Not authorized to remove this comment');
  }

  this.comments.pull(commentId);
  await this.save();
};

/**
 * Method to check if post can be viewed by user
 * Privacy: Respect visibility settings and user privacy
 */
PostSchema.methods.canBeViewedBy = async function(userId?: Types.ObjectId): Promise<boolean> {
  // Public posts can be viewed by anyone
  if (this.visibility === 'public') {
    return true;
  }

  // Private posts can only be viewed by author
  if (this.visibility === 'private') {
    return userId ? this.authorId.equals(userId) : false;
  }

  // Friends posts require friendship check (to be implemented)
  if (this.visibility === 'friends' && userId) {
    // For now, allow author to view friends posts
    // TODO: Implement actual friendship checking
    return this.authorId.equals(userId);
  }

  return false;
};

/**
 * Method to report a post
 * Security: Prevent duplicate reports, maintain moderation queue
 */
PostSchema.methods.report = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.reportedBy.includes(userId)) {
    this.reportedBy.push(userId);
    await this.save();
  }
};

/**
 * Pre-save middleware to update edited timestamp
 */
PostSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

/**
 * Virtual for like count
 */
PostSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

/**
 * Virtual for comment count
 */
PostSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

/**
 * Virtual for report count
 */
PostSchema.virtual('reportCount').get(function() {
  return this.reportedBy.length;
});

// Ensure virtuals are included in JSON output
PostSchema.set('toJSON', { virtuals: true });
PostSchema.set('toObject', { virtuals: true });

export const Post = mongoose.model<IPost>('Post', PostSchema);