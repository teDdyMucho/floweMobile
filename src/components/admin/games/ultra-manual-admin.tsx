import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  writeBatch, 
  increment,
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, Dice1, MessageSquare, Trophy, RotateCcw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface UltraManualAdminProps {
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

interface UltraManualBet {
  id: string;
  userId: string;
  username: string;
  amount: number;
  note: string;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  createdAt: Date;
  processedAt?: Date;
  winAmount?: number;
}

export function UltraManualAdmin({ setError, setMessage }: UltraManualAdminProps) {
  const [bets, setBets] = useState<UltraManualBet[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedBet, setSelectedBet] = useState<UltraManualBet | null>(null);
  const [isWinDialogOpen, setIsWinDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [winAmount, setWinAmount] = useState('');

  useEffect(() => {
    // Listen to Ultra Manual bets
    const betsQuery = query(
      collection(db, 'ultraManualBets'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubBets = onSnapshot(betsQuery, (snapshot) => {
      const betsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        processedAt: doc.data().processedAt?.toDate()
      })) as UltraManualBet[];
      
      setBets(betsList);
    });

    return () => {
      unsubBets();
    };
  }, []);

  const handleBet = async (betId: string, isWin: boolean) => {
    const bet = bets.find(b => b.id === betId);
    if (!bet) {
      setError('Bet not found');
      return;
    }

    if (isWin) {
      setSelectedBet(bet);
      setWinAmount('');
      setIsWinDialogOpen(true);
      return;
    }

    processBet(bet, false);
  };

  const handleCancelBet = (betId: string) => {
    const bet = bets.find(b => b.id === betId);
    if (!bet) {
      setError('Bet not found');
      return;
    }

    setSelectedBet(bet);
    setIsCancelDialogOpen(true);
  };

  const cancelBet = async (bet: UltraManualBet) => {
    setIsProcessing(true);
    
    try {
      const batch = writeBatch(db);
      const betRef = doc(db, 'ultraManualBets', bet.id);
      const userRef = doc(db, 'users', bet.userId);
      
      // Update bet status to cancelled
      batch.update(betRef, {
        status: 'cancelled',
        processedAt: new Date()
      });
      
      // Return the bet amount to the user
      batch.update(userRef, {
        points: increment(bet.amount)
      });
      
      // Create transaction record for the refund
      const transactionRef = collection(db, 'transactions');
      const transactionDoc = {
        userId: bet.userId,
        username: bet.username,
        amount: bet.amount,
        type: 'ultra_manual_cancelled',
        description: `Ultra Manual Game bet cancelled: ${bet.amount} points returned`,
        timestamp: new Date()
      };
      
      batch.set(doc(transactionRef), transactionDoc);
      
      await batch.commit();
      
      setMessage(`Bet cancelled and ${bet.amount} points returned to ${bet.username}`);
      setIsCancelDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel bet');
    } finally {
      setIsProcessing(false);
    }
  };

  const processBet = async (bet: UltraManualBet, isWin: boolean, winAmount?: number) => {
    setIsProcessing(true);
    
    try {
      const batch = writeBatch(db);
      const betRef = doc(db, 'ultraManualBets', bet.id);
      const userRef = doc(db, 'users', bet.userId);
      
      // Update bet status
      batch.update(betRef, {
        status: isWin ? 'won' : 'lost',
        processedAt: new Date(),
        ...(isWin && winAmount ? { winAmount } : {})
      });
      
      // If user won, add winnings to their points
      if (isWin && winAmount) {
        batch.update(userRef, {
          points: increment(winAmount)
        });
        
        // Create transaction record for the win
        const transactionRef = collection(db, 'transactions');
        const transactionDoc = {
          userId: bet.userId,
          username: bet.username,
          amount: winAmount,
          type: 'ultra_manual_win',
          description: `Ultra Manual Game win: ${winAmount} points`,
          timestamp: new Date()
        };
        
        batch.set(doc(transactionRef), transactionDoc);
        
        // Add to winners list for marquee display
        const winnerData = {
          username: bet.username,
          amount: winAmount,
          game: 'Ultra Manual',
          timestamp: new Date()
        };
        
        batch.set(doc(collection(db, 'winners')), winnerData);
      }
      
      await batch.commit();
      
      setMessage(`Bet ${isWin ? 'approved' : 'declined'} successfully`);
      setIsWinDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process bet');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWinSubmit = () => {
    if (!selectedBet) return;
    
    const winAmountValue = parseInt(winAmount);
    if (isNaN(winAmountValue) || winAmountValue <= 0) {
      setError('Please enter a valid win amount');
      return;
    }
    
    processBet(selectedBet, true, winAmountValue);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-6 text-xl font-semibold">Ultra Manual Game Bets</h2>
        
        {bets.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Bet Amount</th>
                    <th className="px-4 py-3">Note</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bets.map((bet) => (
                    <tr key={bet.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className="font-medium text-gray-900">{bet.username}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className="font-medium text-gray-900">{bet.amount} FBT</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center space-x-1">
                          <MessageSquare className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">{bet.note || 'No note'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {bet.createdAt.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => handleBet(bet.id, true)}
                            disabled={isProcessing}
                            className="h-8 bg-green-600 hover:bg-green-700"
                            title="Win"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleBet(bet.id, false)}
                            disabled={isProcessing}
                            className="h-8 bg-red-600 hover:bg-red-700"
                            title="Lose"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleCancelBet(bet.id)}
                            disabled={isProcessing}
                            className="h-8 bg-gray-600 hover:bg-gray-700"
                            title="Cancel and Return Points"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <Dice1 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No pending bets</h3>
            <p className="mt-1 text-sm text-gray-500">
              Pending bets will appear here for review
            </p>
          </div>
        )}
      </div>

      {/* Win Dialog */}
      <Dialog.Root open={isWinDialogOpen} onOpenChange={setIsWinDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9999]" />
          <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-6 shadow-lg z-[10000]">
            <Dialog.Title className="text-xl font-semibold">
              Set Win Amount
            </Dialog.Title>
            
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-sm text-green-800">
                  <span className="font-medium">{selectedBet?.username}</span> bet <span className="font-medium">{selectedBet?.amount} FBT</span>
                </p>
                {selectedBet?.note && (
                  <p className="mt-1 text-xs text-green-600">
                    Note: {selectedBet.note}
                  </p>
                )}
              </div>
              
              <div className="space-y-3">
                <div>
                  <label htmlFor="winAmount" className="block text-sm font-medium text-gray-700">
                    Win Amount (FBT Points)
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Trophy className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      id="winAmount"
                      type="number"
                      value={winAmount}
                      onChange={(e) => setWinAmount(e.target.value)}
                      placeholder="Enter win amount"
                      min="1"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setIsWinDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleWinSubmit}
                  disabled={isProcessing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isProcessing ? 'Processing...' : 'Confirm Win'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Cancel Dialog */}
      <Dialog.Root open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9999]" />
          <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-6 shadow-lg z-[10000]">
            <Dialog.Title className="text-xl font-semibold">
              Cancel Bet and Return Points
            </Dialog.Title>
            
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-800">
                  Are you sure you want to cancel the bet from <span className="font-medium">{selectedBet?.username}</span> and return <span className="font-medium">{selectedBet?.amount} FBT</span> points?
                </p>
                {selectedBet?.note && (
                  <p className="mt-1 text-xs text-gray-600">
                    Note: {selectedBet.note}
                  </p>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setIsCancelDialogOpen(false)}
                >
                  No, Keep Bet
                </Button>
                <Button
                  onClick={() => selectedBet && cancelBet(selectedBet)}
                  disabled={isProcessing}
                  className="bg-gray-600 hover:bg-gray-700"
                >
                  {isProcessing ? 'Processing...' : 'Yes, Cancel and Return Points'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
