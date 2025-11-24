import { z } from 'zod';

/**
 * Validation schemas using Zod for runtime type checking and validation
 * Security: Input validation for all user inputs to prevent attacks
 * Privacy: Enforce data constraints and sanitization
 */

// Common validation patterns
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
const passwordMinLength = 8;
const passwordMaxLength = 128;

/**
 * Authentication validation schemas
 */

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .regex(emailRegex, 'Please enter a valid email address')
    .email('Please enter a valid email address')
    .toLowerCase(),
  password: z
    .string()
    .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters long`)
    .max(passwordMaxLength, 'Password is too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  confirmPassword: z.string(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters long')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(usernameRegex, 'Username can only contain letters, numbers, and underscores'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim(),
  baseLocation: z
    .string()
    .max(100, 'Base location cannot exceed 100 characters')
    .trim()
    .optional(),
  serviceBranch: z
    .enum(['army', 'navy', 'airforce', 'marines', 'coastguard', 'spaceforce'], {
      errorMap: () => ({ message: 'Please select a valid service branch' })
    })
    .optional(),
  parentRank: z
    .string()
    .max(100, 'Parent rank cannot exceed 100 characters')
    .trim()
    .optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required'),
  password: z
    .string()
    .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters long`)
    .max(passwordMaxLength, 'Password is too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters long`)
    .max(passwordMaxLength, 'Password is too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

/**
 * Profile validation schemas
 */

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters long')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(usernameRegex, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim()
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim()
    .optional(),
  bio: z
    .string()
    .max(500, 'Bio cannot exceed 500 characters')
    .trim()
    .optional(),
  isPrivate: z
    .boolean()
    .optional(),
  baseLocation: z
    .string()
    .max(100, 'Base location cannot exceed 100 characters')
    .trim()
    .optional(),
  serviceBranch: z
    .enum(['army', 'navy', 'airforce', 'marines', 'coastguard', 'spaceforce'])
    .optional(),
  parentRank: z
    .string()
    .max(100, 'Parent rank cannot exceed 100 characters')
    .trim()
    .optional(),
});

/**
 * Post validation schemas
 */

export const createPostSchema = z.object({
  content: z
    .string()
    .min(1, 'Post content is required')
    .max(2000, 'Post cannot exceed 2000 characters')
    .trim()
    .refine((content) => {
      // Prevent malicious content
      const maliciousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /data:text\/html/gi,
      ];
      return !maliciousPatterns.some(pattern => pattern.test(content));
    }, 'Post contains invalid content'),
  visibility: z
    .enum(['public', 'friends', 'private'], {
      errorMap: () => ({ message: 'Invalid visibility setting' })
    })
    .default('public'),
  tags: z
    .array(z.string().max(20).regex(/^[a-z0-9-]+$/, 'Tag can only contain lowercase letters, numbers, and hyphens'))
    .max(5, 'Cannot add more than 5 tags')
    .optional(),
});

export const updatePostSchema = z.object({
  content: z
    .string()
    .min(1, 'Post content is required')
    .max(2000, 'Post cannot exceed 2000 characters')
    .trim()
    .refine((content) => {
      const maliciousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /data:text\/html/gi,
      ];
      return !maliciousPatterns.some(pattern => pattern.test(content));
    }, 'Post contains invalid content'),
  visibility: z
    .enum(['public', 'friends', 'private'], {
      errorMap: () => ({ message: 'Invalid visibility setting' })
    })
    .optional(),
  tags: z
    .array(z.string().max(20).regex(/^[a-z0-9-]+$/, 'Tag can only contain lowercase letters, numbers, and hyphens'))
    .max(5, 'Cannot add more than 5 tags')
    .optional(),
});

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment cannot exceed 1000 characters')
    .trim()
    .refine((content) => {
      const maliciousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
      ];
      return !maliciousPatterns.some(pattern => pattern.test(content));
    }, 'Comment contains invalid content'),
});

/**
 * Message validation schemas
 */

export const createMessageSchema = z.object({
  conversationId: z
    .string()
    .min(1, 'Conversation ID is required'),
  content: z
    .string()
    .max(4000, 'Message cannot exceed 4000 characters')
    .trim()
    .optional(), // Optional for image messages
  messageType: z
    .enum(['text', 'image'], {
      errorMap: () => ({ message: 'Invalid message type' })
    })
    .default('text'),
  imageUrl: z
    .string()
    .url('Invalid image URL')
    .optional(),
  replyTo: z
    .string()
    .optional(),
}).refine((data) => {
  // If messageType is image, imageUrl is required
  if (data.messageType === 'image' && !data.imageUrl) {
    return false;
  }
  // If messageType is text, content is required
  if (data.messageType === 'text' && !data.content) {
    return false;
  }
  return true;
}, {
  message: 'Message content is required for text messages, and image URL is required for image messages',
  path: ['content'],
});

export const createConversationSchema = z.object({
  type: z
    .enum(['direct', 'group'], {
      errorMap: () => ({ message: 'Conversation type must be direct or group' })
    }),
  name: z
    .string()
    .min(1, 'Group name is required')
    .max(50, 'Group name cannot exceed 50 characters')
    .trim()
    .optional(), // Required only for group conversations
  participantIds: z
    .array(z.string())
    .min(1, 'At least one participant is required')
    .max(50, 'Cannot add more than 50 participants'),
  baseLocation: z
    .string()
    .max(100, 'Base location cannot exceed 100 characters')
    .trim()
    .optional(),
  isOfficial: z
    .boolean()
    .optional(),
}).refine((data) => {
  // Name is required for group conversations
  if (data.type === 'group' && !data.name) {
    return false;
  }
  // Direct conversations should have exactly 1 additional participant
  if (data.type === 'direct' && data.participantIds.length !== 1) {
    return false;
  }
  // Group conversations need at least 1 additional participant
  if (data.type === 'group' && data.participantIds.length < 1) {
    return false;
  }
  return true;
}, {
  message: 'Invalid conversation configuration',
  path: ['name'],
});

/**
 * File upload validation schemas
 */

export const fileUploadSchema = z.object({
  fileType: z
    .enum(['image'], {
      errorMap: () => ({ message: 'Only image files are allowed' })
    }),
  fileSize: z
    .number()
    .max(5 * 1024 * 1024, 'File size cannot exceed 5MB'), // 5MB limit
  mimeType: z
    .enum(['image/jpeg', 'image/png', 'image/webp'], {
      errorMap: () => ({ message: 'Only JPG, PNG, and WebP images are allowed' })
    }),
});

/**
 * Search and filtering validation schemas
 */

export const searchSchema = z.object({
  query: z
    .string()
    .min(1, 'Search query is required')
    .max(100, 'Search query cannot exceed 100 characters')
    .trim(),
  type: z
    .enum(['users', 'posts', 'all'], {
      errorMap: () => ({ message: 'Invalid search type' })
    })
    .default('all'),
  page: z
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20),
  baseLocation: z
    .string()
    .max(100, 'Base location cannot exceed 100 characters')
    .trim()
    .optional(),
});

export const postsQuerySchema = z.object({
  page: z
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20),
  visibility: z
    .enum(['public', 'friends', 'private', 'all'], {
      errorMap: () => ({ message: 'Invalid visibility filter' })
    })
    .default('public'),
  authorId: z
    .string()
    .optional(),
  tags: z
    .array(z.string())
    .optional(),
  baseLocation: z
    .string()
    .max(100, 'Base location cannot exceed 100 characters')
    .trim()
    .optional(),
});

/**
 * Notification preferences validation
 */

export const notificationPreferencesSchema = z.object({
  emailNotifications: z
    .boolean()
    .default(true),
  pushNotifications: z
    .boolean()
    .default(true),
  likeNotifications: z
    .boolean()
    .default(true),
  commentNotifications: z
    .boolean()
    .default(true),
  followNotifications: z
    .boolean()
    .default(true),
  messageNotifications: z
    .boolean()
    .default(true),
  mentionNotifications: z
    .boolean()
    .default(true),
  systemNotifications: z
    .boolean()
    .default(true),
});

/**
 * Report and moderation validation schemas
 */

export const reportContentSchema = z.object({
  contentType: z
    .enum(['post', 'comment', 'message', 'user'], {
      errorMap: () => ({ message: 'Invalid content type' })
    }),
  contentId: z
    .string()
    .min(1, 'Content ID is required'),
  reason: z
    .enum(['spam', 'harassment', 'inappropriate', 'misinformation', 'other'], {
      errorMap: () => ({ message: 'Please select a valid reason' })
    }),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .trim()
    .optional(),
});

/**
 * Utility types for inference
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type PostsQueryInput = z.infer<typeof postsQuerySchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type ReportContentInput = z.infer<typeof reportContentSchema>;