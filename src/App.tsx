import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { collection, query, where, getDocs, doc, setDoc, runTransaction, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateReferralCode } from '@/lib/utils';
import { AuthPanel } from '@/components/auth/auth-panel';
import UserPanel from '@/components/user/user-panel';
import { GamePanel } from '@/components/games/game-panel';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Header } from '@/components/header';
import { HomePanel } from '@/components/home/home-panel';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { MessageNotification } from '@/components/notifications/message-notification';
import { InstallPrompt } from '@/components/install-prompt';

type ActivePanel = 'user' | 'home' | 'game' | 'admin' | null;

function App() {
  const { user } = useAuthStore();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // Handle hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1) as ActivePanel;
      if (hash === 'home' || hash === 'user' || hash === 'game' || (hash === 'admin' && user?.isAdmin)) {
        setActivePanel(hash);
      } else {
        setActivePanel('home');
      }
    };

    // Set initial panel based on current hash
    handleHash();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [user?.isAdmin]);

  if (!user) {
    return <AuthPanel />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-4 md:py-8">
        <div className="space-y-6 md:space-y-8">
          {activePanel === 'home' && <UserPanel/>}
          {activePanel === 'user' && <HomePanel onBetClick={() => {}}/>}
          {activePanel === 'game' && <GamePanel/>}
          {activePanel === 'admin' && user.isAdmin && <AdminPanel />}
        </div>
      </main>

      <ChatBubble />
      <MessageNotification />
      <InstallPrompt />
    </div>
  );
}

export default App;