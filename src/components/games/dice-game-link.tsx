import { useAuthStore } from '@/store/auth-store';

export default function DiceGameLink() {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold mb-2">You must be logged in to play Dice Game.</div>
        <a href="/login?redirect=/dice-link" className="text-blue-600 underline">Login</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-100 to-white px-4">
      <div className="w-full max-w-xs bg-white rounded-lg shadow-lg p-6 mt-10">
        <h1 className="text-2xl font-bold mb-3 text-center">🎲 Dice Game</h1>
        <div className="mb-4 text-center">
          <div className="text-gray-700 mb-1">Your FBT: <span className="font-bold text-blue-700">{user.points}</span></div>
          <div className="text-gray-700">Your Cash: <span className="font-bold text-green-700">{user.cash ?? 0}</span></div>
        </div>
        <a
          href="/dice-game"
          className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Go to Dice Game
        </a>
        <div className="mt-4 text-xs text-gray-400 text-center">
          Share this page with friends to invite them to play!
        </div>
      </div>
    </div>
  );
}
