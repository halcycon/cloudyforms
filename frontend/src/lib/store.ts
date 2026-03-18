import { create } from 'zustand';
import type { User, Organization } from './types';

interface AppState {
  user: User | null;
  token: string | null;
  currentOrg: Organization | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setCurrentOrg: (org: Organization | null) => void;
  logout: () => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  token: localStorage.getItem('cf_token'),
  currentOrg: null,

  setUser: (user) => set({ user }),

  setToken: (token) => {
    if (token) {
      localStorage.setItem('cf_token', token);
    } else {
      localStorage.removeItem('cf_token');
    }
    set({ token });
  },

  setCurrentOrg: (org) => {
    if (org) {
      localStorage.setItem('cf_current_org', org.id);
    }
    set({ currentOrg: org });
  },

  logout: () => {
    localStorage.removeItem('cf_token');
    localStorage.removeItem('cf_current_org');
    set({ user: null, token: null, currentOrg: null });
  },
}));
