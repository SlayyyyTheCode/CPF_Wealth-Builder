import { create } from "zustand";

interface AppState {
  apiHealthy: boolean | null;
  setApiHealthy: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  apiHealthy: null,
  setApiHealthy: (v) => set({ apiHealthy: v }),
}));
