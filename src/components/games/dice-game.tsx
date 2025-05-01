import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { DiceRound, DiceBet } from './dice-types';

function getColorByColorName(color: 'white' | 'red' | 'green' | 'none' | undefined) {
  if (color === 'green') return 'bg-green-500 text-white';
  if (color === 'red') return 'bg-red-500 text-white';
  if (color === 'white') return 'bg-gray-100 text-gray-900 border border-gray-300';
  return 'bg-white text-gray-900';
}

function getColor(status: 'pending' | 'won' | 'lost' | undefined) {
  if (status === 'won') return 'bg-green-500 text-white';
  if (status === 'lost') return 'bg-red-500 text-white';
  return 'bg-white text-gray-900';
}

export function DiceGame({ setError, setMessage }: { setError: (msg: string) => void, setMessage: (msg: string) => void }) {
  const { user } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [round, setRound] = useState<DiceRound | null>(null);
  const [activeBets, setActiveBets] = useState<DiceBet[]>([]);
  const [betHistory, setBetHistory] = useState<DiceBet[]>([]);
  const [winners, setWinners] = useState<DiceBet[]>([]);
  const [bettingDisabled, setBettingDisabled] = useState(false);

  // Fetch current open round
  useEffect(() => {
    const q = query(collection(db, 'diceRounds'), where('status', '==', 'open'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const rounds = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceRound));
      setRound(rounds.length > 0 ? rounds[0] : null);
      setBettingDisabled(rounds.length === 0);
    });
    return () => unsub();
  }, []);

  // Fetch user's bets for current round
  useEffect(() => {
    if (!user || !round) return;
    const q = query(collection(db, 'diceBets'), where('userId', '==', user.id), where('roundId', '==', round.id));
    const unsub = onSnapshot(q, (snap) => {
      const bets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceBet));
      setActiveBets(bets);
    });
    return () => unsub();
  }, [user, round]);

  // Fetch user's bet history (last 10)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'diceBets'), where('userId', '==', user.id), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const bets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceBet));
      setBetHistory(bets.slice(0, 10));
    });
    return () => unsub();
  }, [user]);

  // Fetch recent winners (last 10)
  useEffect(() => {
    const q = query(collection(db, 'diceBets'), where('status', '==', 'won'), orderBy('resolvedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const wins = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceBet));
      setWinners(wins.slice(0, 10));
    });
    return () => unsub();
  }, []);

  const alreadyBetNumbers = activeBets.map(b => b.chosenNumber);
  const canBet = (num: number) => !alreadyBetNumbers.includes(num) && !bettingDisabled;

  const handleBet = async (num: number) => {
    if (!user || !round) {
      setError('No active round or not logged in.');
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (Number(amount) > user.points) {
      setError('Insufficient points.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'diceBets'), {
        userId: user.id,
        username: user.username,
        chosenNumber: num,
        amount: Number(amount),
        status: 'pending',
        roundId: round.id,
        createdAt: new Date(),
      });
      await updateDoc(doc(db, 'users', user.id), {
        points: user.points - Number(amount),
      });
      setMessage(`Bet placed on ${num}!`);
      setAmount('');
    } catch (e) {
      setError('Failed to place bet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 px-2 sm:px-4 md:px-0">
      <h2 className="text-2xl font-bold text-center mb-2">🎲 Dice Game</h2>
      {round ? (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-center gap-2 mb-2">
            {[1,2,3,4,5,6].map(num => {
              const bet = activeBets.find(b => b.chosenNumber === num);
              let colorClass = getColor(undefined);
              let colorName: 'none' | 'white' | 'red' | 'green' = 'none';
              if (round.status === 'closed' && round.numberColors) {
                colorName = round.numberColors[num] || 'none';
                colorClass = getColorByColorName(colorName);
              } else if (bet) {
                colorClass = getColor(bet.status);
              }
              return (
                <button
                  key={num}
                  className={`rounded-full w-12 h-12 sm:w-14 sm:h-14 text-lg sm:text-xl font-bold border-2 border-gray-300 transition ${colorClass} ${canBet(num) ? 'hover:ring-2 hover:ring-blue-400' : 'opacity-60 cursor-not-allowed'}`}
                  disabled={!canBet(num) || isSubmitting}
                  onClick={() => handleBet(num)}
                >
                  {num}
                </button>
              );
            })}
          </div>
          {round.status === 'closed' && round.numberColors && (
            <div className="flex flex-wrap justify-center gap-2 text-xs mb-2">
              <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-gray-100 border border-gray-300"></span> White: 10 FBT = 5 cash</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-red-500"></span> Red: 10 FBT = 20 FBT</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-green-500"></span> Green: 10 FBT = 20 FBT</span>
            </div>
          )}
          <div className="flex items-center gap-2 justify-center">
            <Input
              className="w-28"
              type="number"
              min={1}
              placeholder="Bet Amount"
              value={amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
              disabled={bettingDisabled}
            />
            <span className="text-gray-500">Points: <b>{user?.points ?? 0}</b></span>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-500">No active round. Please wait for the next round.</div>
      )}
      <div>
        <h3 className="font-semibold mb-1">Your Active Bets</h3>
        {activeBets.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {activeBets.map(bet => {
              const safeRound = round && typeof round === 'object' ? round : null;
              const numberColors = safeRound && typeof safeRound.numberColors === 'object' ? safeRound.numberColors : {};
              let color: 'none' | 'white' | 'red' | 'green' = 'none';
              if (safeRound && safeRound.status === 'closed' && numberColors) {
                color = numberColors[bet.chosenNumber] || 'none';
              }
              const payout = typeof bet.payout === 'number' ? bet.payout : 0;
              return (
                <li key={bet.id} className={`px-3 py-1 rounded-full ${getColorByColorName(color)}`}>
                  #{bet.chosenNumber} - {bet.amount} pts
                  {bet.status === 'won' && (
                    <span className="ml-1">🏆 {color === 'white' ? `+${payout} cash` : color === 'red' || color === 'green' ? `+${payout} FBT` : ''}</span>
                  )}
                  {bet.status === 'lost' && <span className="ml-1">❌</span>}
                </li>
              );
            })}
          </ul>
        ) : <div className="text-gray-400">No active bets.</div>}
      </div>
      <div>
        <h3 className="font-semibold mb-1">Bet History</h3>
        {betHistory.length > 0 ? (
          <ul className="divide-y bg-white rounded-lg shadow-md">
            {betHistory.map(bet => (
              <li key={bet.id} className={`flex justify-between px-3 py-2 ${getColor(bet.status)}`}>
                <span>#{bet.chosenNumber}</span>
                <span>{bet.amount} pts</span>
                <span>{bet.status === 'won' ? '🏆 Win' : bet.status === 'lost' ? '❌ Lose' : '⏳ Pending'}</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-gray-400">No bet history.</div>}
      </div>
      <div>
        <h3 className="font-semibold mb-1">Recent Winners</h3>
        {winners.length > 0 ? (
          <ul className="divide-y bg-white rounded-lg shadow-md">
            {winners.map(win => (
              <li key={win.id} className="flex justify-between px-3 py-2 bg-green-50">
                <span className="font-bold text-green-700">{win.username}</span>
                <span>#{win.chosenNumber}</span>
                <span className="font-semibold">+{win.payout ?? win.amount * 6} pts</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-gray-400">No winners yet.</div>}
      </div>
    </div>
  );
}
