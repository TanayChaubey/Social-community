import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/lib/validations';

interface AuthState {
  user: any | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  socketConnection: WebSocket | null;
  wsConnected: boolean;
}

interface AuthActions {
  setUser: (user: any) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  login: (user: any, tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  updateProfile: (userData: Partial<any>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSocketConnection: (socket: WebSocket | null) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      socketConnection: null,
      wsConnected: false,

      setUser: (user) => {
        set({
          user,
          isAuthenticated: !!user,
          error: null,
        });
      },

      setTokens: (accessToken, refreshToken) => {
        set({
          accessToken,
          refreshToken,
          isAuthenticated: !!accessToken,
        });
      },

      login: (user, { accessToken, refreshToken }) => {
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      },

      logout: () => {
        // Close WebSocket connection
        const { socketConnection } = get();
        if (socketConnection) {
          socketConnection.close();
        }

        // Clear tokens and user data
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          socketConnection: null,
          wsConnected: false,
          error: null,
        });

        // Clear any persisted data
        if (typeof window !== 'undefined') {
          localStorage.removeItem('defence-brats-auth');
          sessionStorage.removeItem('defence-brats-auth');
        }
      },

      updateProfile: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }));
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      setError: (error) => {
        set({ error });
      },

      setSocketConnection: (socketConnection) => {
        set({ socketConnection });
      },

      setWsConnected: (wsConnected) => {
        set({ wsConnected });
      },
    }),
    {
      name: 'defence-brats-auth',
      // Only persist user and tokens
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // Session storage for sensitive data
      storage: {
        getItem: (name) => {
          const item = sessionStorage.getItem(name);
          return item ? JSON.parse(item) : null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
    }
  )
);