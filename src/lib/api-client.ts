import { useAuthStore } from '@/stores/auth-store';

/**
 * API client for making authenticated requests
 * Security: Automatic token management, error handling, and rate limit support
 */

class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || '/api';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const { accessToken } = useAuthStore.getState();
    const headers: Record<string, string> = this.defaultHeaders;

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  /**
   * Handle API response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (response.ok) {
      if (isJson) {
        const data = await response.json();
        return data;
      }
      return {} as T;
    }

    // Handle error responses
    let errorData: any = {};
    if (isJson) {
      errorData = await response.json();
    }

    // Handle token expiry
    if (response.status === 401 && errorData.error?.includes('token')) {
      await this.handleTokenExpiry();
      throw new Error('Token expired. Please login again.');
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(
        `Rate limit exceeded. Please try again in ${retryAfter || 'a few moments'}.`
      );
    }

    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  /**
   * Handle token expiry and refresh
   */
  private async handleTokenExpiry(): Promise<void> {
    const { refreshToken } = useAuthStore.getState();

    if (refreshToken) {
      try {
        const response = await fetch(`${this.baseURL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            useAuthStore.getState().setTokens(
              data.data.accessToken,
              data.data.refreshToken
            );
            return;
          }
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }

    // If refresh fails, logout user
    useAuthStore.getState().logout();
  }

  /**
   * Make GET request
   */
  async get<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make POST request
   */
  async post<T>(endpoint: string, data?: any, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make PUT request
   */
  async put<T>(endpoint: string, data?: any, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make PATCH request
   */
  async patch<T>(endpoint: string, data?: any, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make DELETE request
   */
  async delete<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Upload file with progress callback
   */
  async uploadFile<T>(
    endpoint: string,
    file: File,
    onProgress?: (progress: number) => void,
    options: RequestInit = {}
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    // Add any additional data
    if (options.body && typeof options.body === 'object') {
      Object.entries(options.body as Record<string, any>).forEach(([key, value]) => {
        formData.append(key, value as string);
      });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Handle progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error occurred'));
      });

      // Open and send request
      xhr.open('POST', `${this.baseURL}${endpoint}`);

      // Set authentication header
      const { accessToken } = useAuthStore.getState();
      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      }

      // Add custom headers
      if (options.headers) {
        Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      xhr.send(formData);
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

/**
 * API service for authentication
 */
export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  register: (userData: any) =>
    apiClient.post('/auth/register', userData),

  logout: (refreshToken: string) =>
    apiClient.delete('/auth/logout', { body: { refreshToken } }),

  refreshTokens: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),

  verifyEmail: (token: string) =>
    apiClient.post('/auth/verify-email', { token }),

  resendVerification: (email: string) =>
    apiClient.patch('/auth/verify-email/resend', { email }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword: newPassword,
    }),

  updateProfile: (userData: any) =>
    apiClient.patch('/users/profile', userData),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post('/auth/reset-password', {
      token,
      newPassword,
      confirmPassword: newPassword,
    }),
};

/**
 * API service for posts
 */
export const postsAPI = {
  getPosts: (params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.set(key, value.join(','));
        } else {
          searchParams.set(key, String(value));
        }
      }
    });

    return apiClient.get(`/posts?${searchParams}`);
  },

  getPost: (postId: string) =>
    apiClient.get(`/posts/${postId}`),

  createPost: (postData: any) =>
    apiClient.post('/posts', postData),

  updatePost: (postId: string, postData: any) =>
    apiClient.put(`/posts/${postId}`, postData),

  deletePost: (postId: string) =>
    apiClient.delete(`/posts/${postId}`),

  likePost: (postId: string) =>
    apiClient.post(`/posts/${postId}/like`),

  getComments: (postId: string, params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });

    return apiClient.get(`/posts/${postId}/comments?${searchParams}`);
  },

  addComment: (postId: string, content: string) =>
    apiClient.post(`/posts/${postId}/comments`, { content }),

  updateComment: (postId: string, commentId: string, content: string) =>
    apiClient.put(`/posts/${postId}/comments/${commentId}`, { content }),

  deleteComment: (postId: string, commentId: string) =>
    apiClient.delete(`/posts/${postId}/comments/${commentId}`),
};

/**
 * API service for chat/messaging
 */
export const chatAPI = {
  getConversations: (params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });

    return apiClient.get(`/chat/conversations?${searchParams}`);
  },

  getConversation: (conversationId: string) =>
    apiClient.get(`/chat/conversations/${conversationId}`),

  createConversation: (conversationData: any) =>
    apiClient.post('/chat/conversations', conversationData),

  updateConversation: (conversationId: string, data: any) =>
    apiClient.put(`/chat/conversations/${conversationId}`, data),

  deleteConversation: (conversationId: string) =>
    apiClient.delete(`/chat/conversations/${conversationId}`),

  archiveConversation: (conversationId: string, archive: boolean) =>
    apiClient.patch(`/chat/conversations/${conversationId}`, { archive }),

  getMessages: (conversationId: string, params: Record<string, any> = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });

    return apiClient.get(`/chat/conversations/${conversationId}/messages?${searchParams}`);
  },

  sendMessage: (conversationId: string, messageData: any) =>
    apiClient.post(`/chat/conversations/${conversationId}/messages`, messageData),
};

/**
 * API service for file uploads
 */
export const uploadAPI = {
  uploadImage: (file: File, onProgress?: (progress: number) => void) =>
    apiClient.uploadFile('/upload/image', file, onProgress),

  uploadAvatar: (file: File, onProgress?: (progress: number) => void) =>
    apiClient.uploadFile('/upload/avatar', file, onProgress),
};

/**
 * Health check API
 */
export const healthAPI = {
  getHealth: () => apiClient.get('/health'),
  getDetailedHealth: () => apiClient.post('/health', { detailed: true }),
};