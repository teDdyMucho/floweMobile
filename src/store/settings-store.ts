import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface SettingsState {
  allowDirectTransfers: boolean;
  autoApproveUsers: boolean;
  isLoading: boolean;
  error: string | null;
  initializeSettings: () => Promise<void>;
  setAllowDirectTransfers: (allow: boolean) => Promise<void>;
  setAutoApproveUsers: (allow: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      allowDirectTransfers: false,
      autoApproveUsers: false,
      isLoading: false,
      error: null,

      initializeSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          // Create a listener for the settings document
          const settingsRef = doc(db, 'settings', 'global');
          
          // Set up real-time listener
          onSnapshot(settingsRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
              const data = docSnapshot.data();
              set({ 
                allowDirectTransfers: data.allowDirectTransfers ?? false,
                autoApproveUsers: data.autoApproveUsers ?? false,
                isLoading: false 
              });
            } else {
              // If settings document doesn't exist, create it with default values
              setDoc(settingsRef, { 
                allowDirectTransfers: false,
                autoApproveUsers: false
              })
                .then(() => {
                  set({ 
                    allowDirectTransfers: false, 
                    autoApproveUsers: false,
                    isLoading: false 
                  });
                })
                .catch((error) => {
                  console.error('Error creating settings document:', error);
                  set({ error: 'Failed to create settings', isLoading: false });
                });
            }
          }, (error) => {
            console.error('Error listening to settings:', error);
            set({ error: 'Failed to load settings', isLoading: false });
          });
        } catch (error) {
          console.error('Failed to initialize settings:', error);
          set({ error: 'Failed to initialize settings', isLoading: false });
        }
      },

      setAllowDirectTransfers: async (allow: boolean) => {
        set({ isLoading: true, error: null });
        try {
          const settingsRef = doc(db, 'settings', 'global');
          await setDoc(settingsRef, { allowDirectTransfers: allow }, { merge: true });
          set({ allowDirectTransfers: allow, isLoading: false });
        } catch (error) {
          console.error('Failed to update direct transfers setting:', error);
          set({ error: 'Failed to update settings', isLoading: false });
        }
      },

      setAutoApproveUsers: async (allow: boolean) => {
        set({ isLoading: true, error: null });
        try {
          const settingsRef = doc(db, 'settings', 'global');
          await setDoc(settingsRef, { autoApproveUsers: allow }, { merge: true });
          set({ autoApproveUsers: allow, isLoading: false });
        } catch (error) {
          console.error('Failed to update auto approve users setting:', error);
          set({ error: 'Failed to update settings', isLoading: false });
        }
      },
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({
        allowDirectTransfers: state.allowDirectTransfers,
        autoApproveUsers: state.autoApproveUsers,
      }),
    }
  )
);
