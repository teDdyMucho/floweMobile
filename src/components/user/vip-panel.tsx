import { useState, useEffect } from 'react';
import { useVIPStore } from '@/store/vip-store';
import { Button } from '@/components/ui/button';
import { Crown, Users, Plus, Trash2, Copy, Check, SendHorizonal, User } from 'lucide-react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store/auth-store';
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VIPRequest {
  id: string;
  type: 'vip_upgrade';
  currentLevel: number;
  targetLevel: number;
  status: 'pending' | 'approved' | 'declined';
  timestamp: Date;
}

interface PointTransferRequest {
  id: string;
  type: 'point_transfer';
  recipientId: string;
  recipientUsername: string;
  amount: number;
  status: 'pending' | 'approved' | 'declined';
  timestamp: Date;
}

export function VIPPanel() {
  const { user } = useAuthStore();
  const vipStore = useVIPStore();
  const [copiedCode, setCopiedCode] = useState(false);
  const [upgradeRequest, setUpgradeRequest] = useState<VIPRequest | null>(null);
  const [transferRequests, setTransferRequests] = useState<PointTransferRequest[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [vipData, setVipData] = useState<any>(null);
  
  // Point transfer form state
  const [recipientIdentifier, setRecipientIdentifier] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    if (!user?.id) return;

    // Listen to user's VIP data
    const unsubUser = onSnapshot(doc(db, 'users', user.id), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setVipData({
          vipLevel: data.vipLevel || 0,
          referrals: data.referrals || {},
          maxReferrals: data.maxReferrals || {},
          rewards: data.rewards || {}
        });
      }
    });

    // Listen to user's VIP upgrade requests
    const requestsQuery = query(
      collection(db, 'requests'),
      where('userId', '==', user.id),
      where('type', '==', 'vip_upgrade'),
      where('status', '==', 'pending')
    );

    const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const request = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data(),
          timestamp: snapshot.docs[0].data().timestamp.toDate()
        } as VIPRequest;
        setUpgradeRequest(request);
      } else {
        setUpgradeRequest(null);
      }
    });
    
    // Listen to user's point transfer requests
    const transferRequestsQuery = query(
      collection(db, 'requests'),
      where('userId', '==', user.id),
      where('type', '==', 'point_transfer'),
      where('status', '==', 'pending')
    );

    const unsubTransferRequests = onSnapshot(transferRequestsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate()
        })) as PointTransferRequest[];
        setTransferRequests(requests);
      } else {
        setTransferRequests([]);
      }
    });

    return () => {
      unsubUser();
      unsubRequests();
      unsubTransferRequests();
    };
  }, [user?.id]);

  const copyReferralCode = () => {
    if (!user?.referralCode) return;
    navigator.clipboard.writeText(user.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleUpgrade = async (targetLevel: number) => {
    if (isProcessing || !user) return;

    const costs = {
      1: 100,
      2: 300,
      3: 600,
      4: 1200,
      5: 2400
    };

    if (!confirm(`Request upgrade to be a BANKER${targetLevel}? Cost: ${costs[targetLevel as keyof typeof costs]} PHP`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await vipStore.requestUpgrade(user.id, targetLevel);
      alert('Upgrade request submitted! Please wait for admin approval.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to request upgrade');
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleTransferPoints = async () => {
    if (isProcessing || !user) return;
    
    setTransferError('');
    
    if (!recipientIdentifier) {
      setTransferError('Please enter a username or referral code');
      return;
    }
    
    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setTransferError('Please enter a valid amount');
      return;
    }
    
    if (amount > user.points) {
      setTransferError('Insufficient points for transfer');
      return;
    }
    
    if (!confirm(`Request to transfer ${amount} points to ${recipientIdentifier}?`)) {
      return;
    }
    
    setIsProcessing(true);
    try {
      await vipStore.transferPoints(user.id, recipientIdentifier, amount);
      alert('Transfer request submitted! Please wait for admin approval.');
      setRecipientIdentifier('');
      setTransferAmount('');
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Failed to request transfer');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderVIPLevel = (level: number) => {
    if (!vipData || level > vipData.vipLevel) return null;

    const vipKey = `vip${level}` as keyof typeof vipData.referrals;
    const referrals = vipData.referrals[vipKey] || [];
    const maxReferrals = vipData.maxReferrals[vipKey] || 10;
    const reward = vipData.rewards[vipKey] || 100;

    return (
      <div key={`vip-level-${level}`} className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Crown className="h-6 w-6 text-yellow-500" />
            <h2 className="text-xl font-bold">Banker Level {level}</h2>
          </div>
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">
              {referrals.length} / {maxReferrals} Slots
            </span>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-gray-50 p-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-gray-700">
              Reward per Slot: {reward} FBT ({reward} PHP)
            </p>
            <p className="text-sm font-medium text-gray-700">
              Total FBT: {referrals.length * reward}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: maxReferrals }).map((_, index) => (
            <div
              key={`slot-${level}-${index}`}
              className={`flex h-16 items-center justify-center rounded-lg border-2 p-2 text-center text-sm ${
                index < referrals.length
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              {index < referrals.length ? (
                <span className="break-all text-blue-700">{referrals[index]}</span>
              ) : (
                <span className="text-gray-400">Empty Slot</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!vipData) return null;

  return (
    <div className="space-y-6">
      {/* Referral Code */}
      <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-6 text-white shadow-md">
        <h2 className="mb-4 text-2xl font-bold">Your Referral Code</h2>
        <div className="flex items-center space-x-2">
          <code className="flex-1 rounded-lg bg-white/20 px-4 py-2 font-mono">
            {user?.referralCode}
          </code>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={copyReferralCode}
          >
            {copiedCode ? (
              <Check className="h-5 w-5" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Upgrade Request Status */}
      {upgradeRequest && (
        <div className="rounded-lg bg-yellow-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-yellow-800">
                Pending VIP Upgrade Request
              </h3>
              <p className="mt-1 text-sm text-yellow-600">
                Requesting upgrade from VIP{upgradeRequest.currentLevel} to VIP{upgradeRequest.targetLevel}
              </p>
            </div>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
              Pending Approval
            </span>
          </div>
        </div>
      )}
      
      {/* Point Transfer Section - Only visible for VIP users */}
      {vipData.vipLevel > 0 && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold flex items-center">
            <SendHorizonal className="h-5 w-5 mr-2 text-green-500" />
            Transfer Points
          </h2>
          
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="recipient">Recipient Username or Referral Code</Label>
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-gray-400" />
                <Input 
                  id="recipient"
                  placeholder="Enter username or referral code"
                  value={recipientIdentifier}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientIdentifier(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="amount"
                  type="number"
                  placeholder="Enter amount to transfer"
                  value={transferAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTransferAmount(e.target.value)}
                  min="1"
                  max={user?.points.toString()}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500">
                  Available: {user?.points || 0} points
                </span>
              </div>
            </div>
            
            {transferError && (
              <div className="text-sm text-red-500">{transferError}</div>
            )}
            
            {/* Pending Transfer Requests */}
            {transferRequests.length > 0 && (
              <div className="mt-4 rounded-lg bg-blue-50 p-4">
                <h3 className="font-medium text-blue-800 mb-2">Pending Transfer Requests</h3>
                <div className="space-y-2">
                  {transferRequests.map(request => (
                    <div key={request.id} className="text-sm text-blue-700 flex justify-between">
                      <span>
                        {request.amount} points to {request.recipientUsername}
                      </span>
                      <span className="text-blue-500 text-xs">
                        {new Date(request.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <Button
              onClick={handleTransferPoints}
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600"
            >
              <SendHorizonal className="mr-2 h-4 w-4" />
              Request Point Transfer
            </Button>
          </div>
        </div>
      )}

      {/* VIP Levels */}
      <div className="space-y-6">
        {[1, 2, 3, 4, 5].map(level => renderVIPLevel(level))}
      </div>

      {/* Upgrade Buttons */}
      {!upgradeRequest && vipData.vipLevel < 5 && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleUpgrade(vipData.vipLevel + 1)}
            disabled={isProcessing}
            className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white hover:from-yellow-600 hover:to-amber-600"
          >
            <Crown className="mr-2 h-4 w-4" />
            Request BANKER Level {vipData.vipLevel + 1} Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}