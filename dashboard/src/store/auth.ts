import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  admin: Admin | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      admin: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const response = await api.post('/api/auth/login', { email, password });
        const { token, admin } = response.data;

        set({ token, admin, isAuthenticated: true });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      },

      logout: () => {
        set({ token: null, admin: null, isAuthenticated: false });
        delete api.defaults.headers.common['Authorization'];
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false });
          return;
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        try {
          const response = await api.get('/api/auth/me');
          set({ admin: response.data.admin, isAuthenticated: true });
        } catch {
          set({ token: null, admin: null, isAuthenticated: false });
          delete api.defaults.headers.common['Authorization'];
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
