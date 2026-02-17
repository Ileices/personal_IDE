// ============================================
// Auth Store - Login, logout, account management
// ============================================
import { create } from 'zustand';
import type { GitHubUser } from '@personal-ide/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';

interface AuthAccount {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  isActive: boolean;
  hasCopilot: boolean;
}

interface AuthStore {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: GitHubUser | null;
  accounts: AuthAccount[];
  error: string | null;

  checkAuth: () => Promise<void>;
  login: (pat: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchAccount: (githubUserId: number) => Promise<boolean>;
  removeAccount: (githubUserId: number) => Promise<void>;
  loadAccounts: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  accounts: [],
  error: null,

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const data = await apiGet<{ success: boolean; user: GitHubUser }>('/auth/me');
      if (data.success && data.user) {
        set({ isAuthenticated: true, user: data.user, error: null });
      } else {
        set({ isAuthenticated: false, user: null });
      }
    } catch {
      set({ isAuthenticated: false, user: null });
    } finally {
      set({ isLoading: false });
    }
    await get().loadAccounts();
  },

  login: async (pat: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiPost<{ success: boolean; user?: GitHubUser; error?: string }>('/auth/login', { pat });
      if (data.success && data.user) {
        set({ isAuthenticated: true, user: data.user, error: null });
        await get().loadAccounts();
        return true;
      } else {
        set({ error: data.error || 'Login failed' });
        return false;
      }
    } catch (err: any) {
      set({ error: err.message });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await apiPost('/auth/logout', {});
    } catch { /* ignore */ }
    set({ isAuthenticated: false, user: null });
    await get().loadAccounts();
  },

  switchAccount: async (githubUserId: number) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiPost<{ success: boolean; user?: GitHubUser; error?: string }>('/auth/switch', { githubUserId });
      if (data.success && data.user) {
        set({ isAuthenticated: true, user: data.user, error: null });
        await get().loadAccounts();
        return true;
      } else {
        set({ error: data.error || 'Switch failed' });
        return false;
      }
    } catch (err: any) {
      set({ error: err.message });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  removeAccount: async (githubUserId: number) => {
    try {
      await apiDelete(`/auth/account/${githubUserId}`);
      await get().loadAccounts();
      if (get().user?.id === githubUserId) {
        set({ isAuthenticated: false, user: null });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  loadAccounts: async () => {
    try {
      const data = await apiGet<{ accounts: AuthAccount[] }>('/auth/accounts');
      set({ accounts: data.accounts });
    } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));
