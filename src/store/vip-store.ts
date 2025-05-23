import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, doc, getDoc, updateDoc, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calculateMaxReferrals } from '@/services/vipService';

export interface VIPState {
  vipLevel: number;
  referralCode: string;
  referrals: {
    vip1: string[];
    vip2: string[];
    vip3: string[];
    vip4: string[];
    vip5: string[];
  };
  maxReferrals: {
    vip1: number;
    vip2: number;
    vip3: number;
    vip4: number;
    vip5: number;
  };
  rewards: {
    vip1: number;
    vip2: number;
    vip3: number;
    vip4: number;
    vip5: number;
  };
  initializeVIP: (userId: string) => Promise<void>;
  requestUpgrade: (userId: string, targetLevel: number) => Promise<void>;
  transferPoints: (userId: string, recipientIdentifier: string, amount: number, directTransfer?: boolean) => Promise<void>;
}

export const DEFAULT_VIP_DATA = {
  vipLevel: 0,
  referrals: {
    vip1: [],
    vip2: [],
    vip3: [],
    vip4: [],
    vip5: [],
  },
  maxReferrals: {
    vip1: 10,
    vip2: 10,
    vip3: 10,
    vip4: 10,
    vip5: 10,
  },
  rewards: {
    vip1: 100,
    vip2: 300,
    vip3: 600,
    vip4: 1200,
    vip5: 2400,
  },
};

export const useVIPStore = create<VIPState>()(
  persist(
    (set) => ({
      ...DEFAULT_VIP_DATA,
      referralCode: '',
      initializeVIP: async (userId: string) => {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);

          if (!userDoc.exists()) {
            throw new Error('User not found');
          }

          const userData = userDoc.data();
          const currentLevel = userData.vipLevel || DEFAULT_VIP_DATA.vipLevel;

          // If VIP data is missing, initialize the document.
          if (!userData.vipLevel) {
            await updateDoc(userRef, {
              vipLevel: DEFAULT_VIP_DATA.vipLevel,
              referrals: DEFAULT_VIP_DATA.referrals,
              maxReferrals: calculateMaxReferrals(currentLevel),
              rewards: DEFAULT_VIP_DATA.rewards,
            });
          }

          // Update local state.
          set({
            vipLevel: currentLevel,
            referralCode: userData.referralCode,
            referrals: {
              ...DEFAULT_VIP_DATA.referrals,
              ...userData.referrals,
            },
            maxReferrals: {
              ...calculateMaxReferrals(currentLevel),
              ...userData.maxReferrals,
            },
            rewards: {
              ...DEFAULT_VIP_DATA.rewards,
              ...userData.rewards,
            },
          });
        } catch (error) {
          console.error('Failed to initialize VIP:', error);
          throw error;
        }
      },
      requestUpgrade: async (userId: string, targetLevel: number) => {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);

          if (!userDoc.exists()) {
            throw new Error('User not found');
          }

          const userData = userDoc.data();
          const currentLevel = userData.vipLevel || DEFAULT_VIP_DATA.vipLevel;

          if (targetLevel <= currentLevel) {
            throw new Error('Cannot upgrade to same or lower level');
          }

          if (targetLevel > 5) {
            throw new Error('Invalid VIP level');
          }

          // Create an upgrade request.
          await addDoc(collection(db, 'requests'), {
            userId,
            username: userData.username,
            type: 'vip_upgrade',
            currentLevel,
            targetLevel,
            status: 'pending',
            timestamp: new Date(),
          });
        } catch (error) {
          console.error('Failed to request upgrade:', error);
          throw error;
        }
      },
      transferPoints: async (userId: string, recipientIdentifier: string, amount: number, directTransfer: boolean = false) => {
        try {
          // Validate input
          if (!userId) throw new Error('User ID is required');
          if (!recipientIdentifier) throw new Error('Recipient username or referral code is required');
          if (!amount || amount <= 0) throw new Error('Transfer amount must be greater than 0');

          // Get sender user data
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);

          if (!userDoc.exists()) {
            throw new Error('User not found');
          }

          const userData = userDoc.data();
          
          // No longer checking if user is VIP - all users can transfer points

          // Check if user has enough points
          if (userData.points < amount) {
            throw new Error('Insufficient points for transfer');
          }

          // Find recipient by username or referral code
          const usersRef = collection(db, 'users');
          const q = query(
            usersRef,
            where(
              recipientIdentifier.startsWith('FBT') ? 'referralCode' : 'username',
              '==',
              recipientIdentifier.startsWith('FBT') ? recipientIdentifier : recipientIdentifier.toLowerCase()
            )
          );
          
          const querySnapshot = await getDocs(q);
          
          if (querySnapshot.empty) {
            throw new Error('Recipient not found');
          }
          
          const recipientDoc = querySnapshot.docs[0];
          const recipientData = recipientDoc.data();
          const recipientId = recipientDoc.id;
          
          // Don't allow transfers to self
          if (recipientId === userId) {
            throw new Error('Cannot transfer points to yourself');
          }

          // If directTransfer is true, process the transfer immediately without admin approval
          if (directTransfer) {
            // Update sender's points (deduct)
            const newSenderPoints = userData.points - amount;
            await updateDoc(userRef, {
              points: newSenderPoints
            });
            
            // Update recipient's points (add)
            const recipientRef = doc(db, 'users', recipientId);
            const recipientPoints = recipientData.points || 0;
            const newRecipientPoints = recipientPoints + amount;
            await updateDoc(recipientRef, {
              points: newRecipientPoints
            });
            
            // Log sender transaction
            await addDoc(collection(db, 'transactions'), {
              userId,
              username: userData.username,
              amount: -amount,
              type: 'point_transfer_out',
              description: `Transferred ${amount} points to ${recipientData.username}`,
              timestamp: new Date(),
              balanceAfter: {
                points: newSenderPoints,
                cash: userData.cash || 0
              }
            });
            
            // Log recipient transaction
            await addDoc(collection(db, 'transactions'), {
              userId: recipientId,
              username: recipientData.username,
              amount: amount,
              type: 'point_transfer_in',
              description: `Received ${amount} points from ${userData.username}`,
              timestamp: new Date(),
              balanceAfter: {
                points: newRecipientPoints,
                cash: recipientData.cash || 0
              }
            });
          } else {
            // Create a transfer request for admin approval
            await addDoc(collection(db, 'requests'), {
              userId,
              username: userData.username,
              type: 'point_transfer',
              recipientId,
              recipientUsername: recipientData.username,
              amount,
              status: 'pending',
              timestamp: new Date(),
              directTransfer: directTransfer
            });
          }

          return;
        } catch (error) {
          console.error('Failed to transfer points:', error);
          throw error;
        }
      },
    }),
    {
      name: 'vip-storage',
      partialize: (state) => ({
        vipLevel: state.vipLevel,
        referralCode: state.referralCode,
        referrals: state.referrals,
        rewards: state.rewards,
      }),
    }
  )
);
