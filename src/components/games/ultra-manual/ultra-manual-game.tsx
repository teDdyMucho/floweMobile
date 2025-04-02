import { useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dice1, MessageSquare } from 'lucide-react';

interface UltraManualGameProps {
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

export function UltraManualGame({ setError, setMessage }: UltraManualGameProps) {
  const { user } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to place a bet');
      return;
    }
    
    const betAmount = parseInt(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (betAmount > user.points) {
      setError('Insufficient points for this bet');
      return;
    }

    if (!note.trim()) {
      setError('Please add a note for your bet');
      return;
    }

    if (note.length > 100) {
      setError('Note must be 100 characters or less');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Create bet request
      await addDoc(collection(db, 'ultraManualBets'), {
        userId: user.id,
        username: user.username,
        amount: betAmount,
        note: note.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      // Deduct points from user
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        points: user.points - betAmount
      });
      
      // Log transaction
      await addDoc(collection(db, 'transactions'), {
        userId: user.id,
        username: user.username,
        amount: -betAmount,
        type: 'ultra_manual_bet',
        description: `Ultra Manual Bet: ${betAmount} points`,
        timestamp: new Date(),
        balanceAfter: {
          points: user.points - betAmount,
          cash: user.cash || 0
        }
      });
      
      // Update local user state
      useAuthStore.setState(state => ({
        ...state,
        user: {
          ...state.user!,
          points: user.points - betAmount
        }
      }));
      
      setMessage('Bet placed successfully! Admin will review your bet.');
      setAmount('');
      setNote('');
    } catch (error) {
      console.error('Failed to place bet:', error);
      setError('Failed to place bet. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Game Instructions */}
      <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 p-6 text-white shadow-lg">
        <h2 className="mb-4 text-2xl font-bold">Ultra Manual Game</h2>
        <div className="space-y-3">
          <p className="text-white/90">
            Place your bet and add a personal note. The admin will manually review and process your bet.
          </p>
          <ul className="list-inside list-disc space-y-2 text-white/90">
            <li>Enter any amount of points to bet</li>
            <li>Add a note (required, max 100 characters)</li>
            <li>Admin will review your bet and determine if you win or lose</li>
            <li>If you win, your winnings will be added to your account</li>
          </ul>
        </div>
      </div>

      {/* Bet Form */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h3 className="mb-4 text-xl font-semibold">Place Your Bet</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
              Bet Amount (FBT Points)
            </label>
            <div className="mt-1 flex items-center">
              <Dice1 className="mr-2 h-5 w-5 text-gray-400" />
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount to bet"
                min="1"
                max={user?.points?.toString()}
                className="flex-1"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Available: {user?.points || 0} points
            </p>
          </div>
          
          <div>
            <label htmlFor="note" className="block text-sm font-medium text-gray-700">
              Note (Required, max 100 characters)
            </label>
            <div className="mt-1 flex items-center">
              <MessageSquare className="mr-2 h-5 w-5 text-gray-400" />
              <Input
                id="note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note for the admin"
                maxLength={100}
                className="flex-1"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {note.length}/100 characters
            </p>
          </div>
          
          <Button
            type="submit"
            disabled={isSubmitting || !amount || parseInt(amount) <= 0 || parseInt(amount) > (user?.points || 0) || !note.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {isSubmitting ? 'Processing...' : 'Place Bet'}
          </Button>
        </form>
      </div>
    </div>
  );
}
