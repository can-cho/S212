import { create } from 'zustand';

interface AuthState {
  user: any | null;
  role: string | null;
  userName: string;
  setUser: (user: any | null, role: string | null, userName: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  userName: '',
  setUser: (user, role, userName) => set({ user, role, userName }),
}));