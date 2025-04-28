import { collection, query, where, getDocs, doc, writeBatch, increment, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Process multi-level referral bonuses for a newly approved user
 * @param userId The ID of the user being approved
 * @param referralCodeFriend The referral code of the direct referrer
 * @returns Promise that resolves when all referral bonuses have been processed
 */
export const processReferralBonuses = async (userId: string, referralCodeFriend: string): Promise<void> => {
  if (!referralCodeFriend || referralCodeFriend === 'Not set') {
    console.log('No referral code provided, skipping referral bonus processing');
    return;
  }

  try {
    const batch = writeBatch(db);
    
    // Multi-level referral system:
    // Bonus amounts for each level:
    // Level 1: 100, Level 2: 5, Level 3: 5, Level 4: 10, Level 5: 30
    const bonusLevels = [100, 5, 5, 10, 30];
    // Define which field to update for each level: level 1 credits points, levels 2-5 credit cash.
    const bonusGive = ['points', 'cash', 'cash', 'cash', 'cash'];
    let currentReferralCode = referralCodeFriend;
    
    // Keep track of referrers who have already been rewarded to prevent duplicates
    const processedReferrers = new Set();
    
    for (let level = 0; level < bonusLevels.length; level++) {
      if (!currentReferralCode || currentReferralCode === 'Not set') break;
      
      const referrerQuery = query(
        collection(db, 'users'),
        where('referralCode', '==', currentReferralCode)
      );
      const referrerSnapshot = await getDocs(referrerQuery);
      if (referrerSnapshot.empty) break;
    
      const referrerDoc = referrerSnapshot.docs[0];
      const referrerId = referrerDoc.id;
      
      // Skip if this referrer has already been processed (prevents double rewards)
      if (processedReferrers.has(referrerId)) {
        console.log(`Skipping duplicate referrer: ${referrerId} at level ${level + 1}`);
        break; // Exit the loop as we've hit a cycle in the referral chain
      }
      
      // Mark this referrer as processed
      processedReferrers.add(referrerId);
      
      const referrerData = referrerDoc.data();
    
      // Update the referrer's document:
      // - Add the approved user's ID to their referrals array.
      // - Credit bonus to the appropriate field (points or cash) for the current level.
      batch.update(referrerDoc.ref, {
        referrals: arrayUnion(userId),
        [bonusGive[level]]: increment(bonusLevels[level])
      });
    
      // Log the referral bonus as a transaction.
      const transactionRef = doc(collection(db, 'transactions'));
      batch.set(transactionRef, {
        userId: referrerDoc.id,
        username: referrerData.username,
        amount: bonusLevels[level],
        type: `referral_bonus_level_${level + 1}`,
        description: `Referral bonus for level ${level + 1} awarded: ${bonusLevels[level]} ${bonusGive[level]}`,
        timestamp: new Date(),
        balanceAfter: {
          points: (referrerData.points || 0) + (bonusGive[level] === 'points' ? bonusLevels[level] : 0),
          cash: (referrerData.cash || 0) + (bonusGive[level] === 'cash' ? bonusLevels[level] : 0)
        }
      });
      
      // Move up the chain using the current referrer's referralCodeFriend.
      currentReferralCode = referrerData.referralCodeFriend;
    }

    await batch.commit();
    console.log('Referral bonuses processed successfully');
  } catch (error) {
    console.error('Error processing referral bonuses:', error);
    throw error;
  }
};
