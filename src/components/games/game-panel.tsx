import { useState, useEffect } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dice1 as Dice, Binary as Bingo, Swords, PiggyBank, Dices } from 'lucide-react';
import { Lucky2Game } from './lucky2/lucky2-game';
import { BingoGame } from './bingo/bingo-game';
import { VersusGames } from './versus/versus-games';
import { InvestmentsGame } from './investments/investments-game';
import { UltraManualGame } from './ultra-manual/ultra-manual-game';

interface GameStatus {
  lucky2: boolean;
  bingo: boolean;
  horse: boolean
}

interface GameData {
  lucky2: {
    status: 'open' | 'closed';
    jackpot: number;
  };
  bingo: {
    status: 'open' | 'closed';
    numbers: string[];
  };
}

export function GamePanel() {
  const [gameStatus, setGameStatus] = useState<GameStatus>({
    lucky2: false,
    bingo: false,
    horse: false
  });
  const [gameData, setGameData] = useState<GameData>({
    lucky2: {
      status: 'closed',
      jackpot: 0
    },
    bingo: {
      status: 'closed',
      numbers: []
    }
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedGame, setSelectedGame] = useState<'lucky2' | 'bingo' | 'versus' | 'investments' | 'ultraManual'>('lucky2');

  useEffect(() => {
    // Listen to Lucky2 game status
    const unsubLucky2 = onSnapshot(doc(db, 'gameRounds', 'lucky2Round'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameStatus(prev => ({
          ...prev,
          lucky2: data.status === 'open'
        }));
        setGameData(prev => ({
          ...prev,
          lucky2: {
            status: data.status,
            jackpot: data.jackpot || 0
          }
        }));
      }
    });

    // Listen to Bingo game status
    const unsubBingo = onSnapshot(doc(db, 'gameRounds', 'bingoRound'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameStatus(prev => ({
          ...prev,
          bingo: data.status === 'open'
        }));
        setGameData(prev => ({
          ...prev,
          bingo: {
            status: data.status,
            numbers: data.numbers || []
          }
        }));
      }
    });


    return () => {
      unsubLucky2();
      unsubBingo();
    };
  }, []);

  const games = [
    {
      id: 'lucky2' as const,
      name: 'SikBo2',
      icon: Dice,
      color: 'from-yellow-400 via-orange-400 to-red-400',
      description: 'Pick your lucky numbers',
      status: gameStatus.lucky2 ? 'open' : 'closed'
    },
    {
      id: 'bingo' as const,
      name: 'Bingo',
      icon: Bingo,
      color: 'from-blue-400 via-indigo-400 to-purple-400',
      description: 'Classic bingo game',
      status: gameStatus.bingo ? 'open' : 'closed'
    },
    {
      id: 'versus' as const,
      name: 'Versus',
      icon: Swords,
      color: 'from-green-400 via-emerald-400 to-teal-400',
      description: 'Team vs Team betting'
    },
    {
      id: 'investments' as const,
      name: 'Investments',
      icon: PiggyBank,
      color: 'from-blue-500 via-indigo-500 to-purple-500',
      description: 'Secure FBT investments'
    },
    {
      id: 'ultraManual' as const,
      name: 'Ultra Manual',
      icon: Dices,
      color: 'from-purple-500 via-pink-500 to-rose-500',
      description: 'Manual bet processing'
    }
  ];

  const renderGameContent = () => {
    switch (selectedGame) {
      case 'lucky2':
        return (
          <Lucky2Game
            gameStatus={gameData.lucky2.status}
            jackpot={gameData.lucky2.jackpot}
            setError={setError}
            setMessage={setMessage}
          />
        );
      case 'bingo':
        return (
          <BingoGame
            gameStatus={gameData.bingo.status}
            bingoNumbers={gameData.bingo.numbers}
            setError={setError}
            setMessage={setMessage}
          />
        );
      case 'versus':
        return <VersusGames onBetClick={() => {}} />;
      case 'investments':
        return <InvestmentsGame setError={setError} setMessage={setMessage} />;
      case 'ultraManual':
        return <UltraManualGame setError={setError} setMessage={setMessage} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Game Selection Buttons */}
      <div className="grid gap-4 md:grid-cols-4">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => setSelectedGame(game.id)}
            data-game={game.id}
            className={`group relative overflow-hidden rounded-xl p-6 shadow-lg transition-all hover:shadow-xl ${
              selectedGame === game.id
                ? `bg-gradient-to-br ${game.color} text-white`
                : 'bg-white hover:bg-gray-50'
            }`}
          >
            <div className="relative z-10 flex items-center space-x-4">
              <game.icon className={`h-12 w-12 ${selectedGame === game.id ? 'text-white' : `text-${game.color.split('-')[1]}-500`}`} />
              <div>
                <h3 className="text-xl font-bold">{game.name}</h3>
                <p className="mt-1 text-sm opacity-90">{game.description}</p>
                {'status' in game && (
                  <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                    game.status === 'open' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {game.status === 'open' ? 'LIVE' : 'Closed'}
                  </span>
                )}
              </div>
            </div>
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.2),transparent)] opacity-70" />
          </button>
        ))}
      </div>

      {/* Game Content */}
      <div className="mt-8">
        {renderGameContent()}
      </div>

      {/* Error and Message Display */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-700">{message}</p>
        </div>
      )}
    </div>
  );
}