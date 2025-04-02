import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 rounded-lg bg-white p-4 shadow-lg md:bottom-8 md:left-auto md:right-8 md:w-96">
      <div className="flex items-start space-x-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Install FlowerAsia</h3>
          <p className="mt-1 text-sm text-gray-600">
            Install our app for a better experience and quick access to your games!
          </p>
        </div>
        <Button
          onClick={handleInstall}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          <span>Install</span>
        </Button>
      </div>
    </div>
  );
}