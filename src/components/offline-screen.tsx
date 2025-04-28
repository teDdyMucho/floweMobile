import React, { useEffect, useState } from 'react';

interface OfflineScreenProps {
  isOffline: boolean;
}

export const OfflineScreen: React.FC<OfflineScreenProps> = ({ isOffline: initialIsOffline }) => {
  const [isOffline, setIsOffline] = useState(initialIsOffline);
  const [retryCount, setRetryCount] = useState(0);
  const [lastRetryTime, setLastRetryTime] = useState(0);

  // Update local state when prop changes
  useEffect(() => {
    setIsOffline(initialIsOffline);
  }, [initialIsOffline]);

  // Periodically check connection status
  useEffect(() => {
    if (!isOffline) return;

    const checkConnection = async () => {
      try {
        // Try to fetch the ping endpoint with cache busting
        const response = await fetch(`/api/ping?t=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
          setIsOffline(false);
          // Reset retry count when connection is restored
          setRetryCount(0);
        }
      } catch (error) {
        // Still offline
        setIsOffline(true);
      }
    };

    // Check connection every 5 seconds
    const intervalId = setInterval(checkConnection, 5000);
    return () => clearInterval(intervalId);
  }, [isOffline]);

  // Clear all caches to ensure fresh content
  const clearAllCaches = async () => {
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        console.log('All caches cleared successfully');
      } catch (error) {
        console.error('Error clearing caches:', error);
      }
    }
    
    // Also notify service worker to clear cache
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('clearCache');
    }
  };

  const handleManualRetry = async () => {
    // Prevent rapid clicking
    const now = Date.now();
    if (now - lastRetryTime < 2000) return;
    
    setLastRetryTime(now);
    setRetryCount(prev => prev + 1);
    
    // Clear all caches before checking connection
    await clearAllCaches();
    
    try {
      // Add cache-busting parameter and no-cache headers
      const response = await fetch(`/api/ping?t=${now}`, {
        method: 'HEAD',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (response.ok) {
        setIsOffline(false);
        setRetryCount(0);
        
        // Force reload to get fresh content when connection is restored
        window.location.reload();
      }
    } catch (error) {
      // Still offline
      console.log('Connection check failed:', error);
    }
  };

  if (!isOffline) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col items-center justify-center text-white p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-xl p-8 shadow-2xl border border-red-500">
        <div className="flex justify-center mb-6">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-24 w-24 text-red-500" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold mb-4 text-center text-red-500">No Internet Connection</h1>
        
        <div className="space-y-4 mb-6">
          <p className="text-xl text-center">
            This gaming site requires an active internet connection.
          </p>
          <p className="text-lg text-center">
            All features are disabled while offline.
          </p>
        </div>
        
        <div className="flex flex-col items-center">
          <button 
            onClick={handleManualRetry}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
          >
            {retryCount > 0 ? `Retry & Clear Cache (${retryCount})` : 'Check Connection & Clear Cache'}
          </button>
          
          <p className="mt-4 text-sm text-gray-400">
            Automatically checking connection every 5 seconds...
          </p>
        </div>
      </div>
    </div>
  );
};
