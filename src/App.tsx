import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { AuthPanel } from '@/components/auth/auth-panel';
import UserPanel from '@/components/user/user-panel';
import { GamePanel } from '@/components/games/game-panel';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Header } from '@/components/header';
import { HomePanel } from '@/components/home/home-panel';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { MessageNotification } from '@/components/notifications/message-notification';
import { InstallPrompt } from '@/components/install-prompt';
import { OfflineScreen } from '@/components/offline-screen';
import DiceGameLink from '@/components/games/dice-game-link';

type ActivePanel = 'user' | 'home' | 'game' | 'admin' | null;

// Clear all caches to ensure fresh content on page load
const clearCachesOnLoad = async () => {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      console.log('All caches cleared on page load');
    } catch (error) {
      console.error('Error clearing caches:', error);
    }
  }
};

function App() {
  // Quick path-based override for /dice-link
  if (typeof window !== 'undefined' && window.location.pathname === '/dice-link') {
    return <DiceGameLink />;
  }
  const { user } = useAuthStore();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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

  // Clear cache on initial load
  useEffect(() => {
    clearCachesOnLoad();
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Clear cache and reload when coming back online to get fresh content
      clearCachesOnLoad().then(() => window.location.reload());
    };
    const handleOffline = () => setIsOffline(true);
    
    // Check connection status immediately
    setIsOffline(!navigator.onLine);
    
    // Add event listeners for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodically check connection to server
    const checkServerConnection = async () => {
      try {
        // Try to fetch a small resource from your server with a cache-busting parameter
        const response = await fetch(`/api/ping?t=${Date.now()}`, { 
          method: 'HEAD',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) {
          setIsOffline(true);
        }
      } catch (error) {
        // If fetch fails, user is offline or server is down
        setIsOffline(true);
      }
    };
    
    // Check connection every 30 seconds
    const intervalId = setInterval(checkServerConnection, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, []);

  if (!user) {
    return <AuthPanel />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OfflineScreen isOffline={isOffline} />
      
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