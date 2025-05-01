import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, doc, updateDoc, addDoc, orderBy, writeBatch, getDocs
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { DiceRound, DiceBet } from '@/components/games/dice-types';

function getColor(status: 'pending' | 'won' | 'lost' | undefined) {
  if (status === 'won') return 'bg-green-500 text-white';
  if (status === 'lost') return 'bg-red-500 text-white';
  return 'bg-white text-gray-900';
}

export function DiceAdmin({ setError, setMessage }: { setError: (msg: string) => void, setMessage: (msg: string) => void }) {
  const [round, setRound] = useState<DiceRound | null>(null);
  const [bets, setBets] = useState<DiceBet[]>([]);
  const [numberColors, setNumberColors] = useState<{ [num: number]: 'none' | 'white' | 'red' | 'green' }>({
    1: 'none', 2: 'none', 3: 'none', 4: 'none', 5: 'none', 6: 'none',
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [winners, setWinners] = useState<DiceBet[]>([]);
  const [history, setHistory] = useState<DiceRound[]>([]);
  const [isCreatingRound, setIsCreatingRound] = useState(false);

  // Listen for current open round
  useEffect(() => {
    const q = query(collection(db, 'diceRounds'), where('status', '==', 'open'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const rounds = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceRound));
      setRound(rounds.length > 0 ? rounds[0] : null);
    });
    return () => unsub();
  }, []);

  // Listen for all bets in current round
  useEffect(() => {
    if (!round) { setBets([]); return; }
    const q = query(collection(db, 'diceBets'), where('roundId', '==', round.id));
    const unsub = onSnapshot(q, (snap) => {
      setBets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceBet)));
    });
    return () => unsub();
  }, [round]);

  // Listen for recent winners
  useEffect(() => {
    const q = query(collection(db, 'diceBets'), where('status', '==', 'won'), orderBy('resolvedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setWinners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceBet)).slice(0, 10));
    });
    return () => unsub();
  }, []);

  // Listen for round history
  useEffect(() => {
    const q = query(collection(db, 'diceRounds'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiceRound)).slice(0, 10));
    });
    return () => unsub();
  }, []);

  // Admin: Create a new round
  const createRound = async () => {
    setIsCreatingRound(true);
    try {
      await addDoc(collection(db, 'diceRounds'), {
        status: 'open',
        numberColors: { 1: 'none', 2: 'none', 3: 'none', 4: 'none', 5: 'none', 6: 'none' },
        createdAt: new Date(),
      });
      setMessage('New round created!');
      setNumberColors({ 1: 'none', 2: 'none', 3: 'none', 4: 'none', 5: 'none', 6: 'none' });
    } catch {
      setError('Failed to create round.');
    } finally {
      setIsCreatingRound(false);
    }
  };

  // Admin: Close round and resolve bets with color mapping
  const closeRoundAndResolve = async () => {
    if (!round) {
      setError('No open round.');
      return;
    }
    // At least one color should be set
    const hasWinner = Object.values(numberColors).some(c => c !== 'none');
    if (!hasWinner) {
      setError('Set at least one color for a number.');
      return;
    }
    setIsDrawing(true);
    try {
      // Update round with color mapping
      await updateDoc(doc(db, 'diceRounds', round.id), {
        status: 'closed',
        numberColors,
        closedAt: new Date(),
      });
      // Resolve bets
      const q = query(collection(db, 'diceBets'), where('roundId', '==', round.id));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((docSnap: any) => {
        const bet = docSnap.data() as DiceBet;
        const color = numberColors[bet.chosenNumber as 1|2|3|4|5|6] || 'none';
        let payout = 0;
        let payoutType: 'cash' | 'fbt' | null = null;
        if (color === 'white') {
          payout = Math.floor(bet.amount / 10) * 5;
          payoutType = 'cash';
        } else if (color === 'red' || color === 'green') {
          payout = Math.floor(bet.amount / 10) * 20;
          payoutType = 'fbt';
        }
        batch.update(doc(db, 'diceBets', docSnap.id), {
          status: color === 'none' ? 'lost' : 'won',
          resultColor: color,
          resolvedAt: new Date(),
          payout,
          payoutType,
        });
        if (color !== 'none' && payout > 0) {
          if (payoutType === 'fbt') {
            batch.update(doc(db, 'users', bet.userId), {
              points: (bet.amount + payout), // add FBT winnings
            });
          }
          // For cash payout, you may want to trigger a manual cash payout process
        }
      });
      await batch.commit();
      setMessage('Round closed and bets resolved!');
      setNumberColors({ 1: 'none', 2: 'none', 3: 'none', 4: 'none', 5: 'none', 6: 'none' });
    } catch {
      setError('Failed to resolve round.');
    } finally {
      setIsDrawing(false);
    }
  };


  // (toggleDrawnNumber and drawnNumbers logic removed)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-center mb-2">🎲 Dice Game Admin</h2>
      {/* Shareable Dice Game Link */}
      <div className="flex flex-col items-center mb-4">
        <span className="text-sm text-gray-600 mb-1">Share this link to invite users to play:</span>
        <div className="flex items-center gap-2">
          <input
            className="border px-2 py-1 rounded w-60 text-xs"
            value={window.location.origin + '/dice-link'}
            readOnly
            onFocus={e => e.target.select()}
          />
          <button
            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin + '/dice-link');
            }}
            type="button"
          >Copy</button>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div>
          <div className="mb-2">Current Round: <b>{round ? round.id : 'None'}</b> <span className={`ml-2 px-2 py-1 rounded-full text-xs ${round?.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{round?.status ?? 'none'}</span></div>
          {!round || round.status === 'closed' ? (
            <Button onClick={createRound} disabled={isCreatingRound}>+ New Round</Button>
          ) : null}
        </div>
        {round && round.status === 'open' && (
          <div>
            <div className="mb-1 font-medium">Set Winning Color for Each Number:</div>
            <div className="flex gap-2 mb-2">
              {[1,2,3,4,5,6].map(num => (
                <div key={num} className="flex flex-col items-center">
                  <span className="font-bold mb-1">{num}</span>
                  <select
                    value={numberColors[num]}
                    onChange={e => setNumberColors(nc => ({ ...nc, [num]: e.target.value as 'none' | 'white' | 'red' | 'green' }))}
                    className={`rounded border px-2 py-1 ${numberColors[num] === 'none' ? 'bg-gray-100' : numberColors[num] === 'white' ? 'bg-white' : numberColors[num] === 'red' ? 'bg-red-200' : 'bg-green-200'}`}
                  >
                    <option value="none">None</option>
                    <option value="white">White</option>
                    <option value="red">Red</option>
                    <option value="green">Green</option>
                  </select>
                </div>
              ))}
            </div>
            <Button onClick={closeRoundAndResolve} disabled={isDrawing}>Close & Resolve Round</Button>
          </div>
        )}
      </div>
      {/* Bets per number summary */}
      <div>
        <h3 className="font-semibold mb-1">Bets Per Number</h3>
        <div className="flex gap-2 mb-3">
          {[1,2,3,4,5,6].map(num => {
            const count = bets.filter(b => b.chosenNumber === num).length;
            return (
              <div key={num} className="flex flex-col items-center px-2">
                <span className="font-bold text-lg">{num}</span>
                <span className={`text-sm px-2 py-1 rounded ${count === 0 ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>{count} bet{count !== 1 ? 's' : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-1">All Bets This Round</h3>
        {bets.length > 0 ? (
          <ul className="divide-y bg-white rounded-lg shadow-md">
            {bets.map(bet => (
              <li key={bet.id} className={`flex justify-between px-3 py-2 ${getColor(bet.status)}`}>
                <span>{bet.username}</span>
                <span>#{bet.chosenNumber}</span>
                <span>{bet.amount} pts</span>
                <span>{bet.status === 'won' ? '🏆 Win' : bet.status === 'lost' ? '❌ Lose' : '⏳ Pending'}</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-gray-400">No bets for this round.</div>}
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
      <div>
        <h3 className="font-semibold mb-1">Round History</h3>
        {history.length > 0 ? (
          <ul className="divide-y bg-white rounded-lg shadow-md">
            {history.map(r => (
              <li key={r.id} className="flex justify-between px-3 py-2">
                <span>{r.id}</span>
                <span>{r.numberColors ? Object.entries(r.numberColors).filter(([_, c]) => c !== 'none').map(([num, c]) => `${num}:${c}`).join(', ') : '-'}</span>
                <span>{r.status === 'closed' ? 'Closed' : 'Open'}</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-gray-400">No round history.</div>}
      </div>
    </div>
  );
}
