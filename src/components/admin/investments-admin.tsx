import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc,
  orderBy,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  PiggyBank, 
  Calendar, 
  Percent, 
  Check, 
  X, 
  Clock, 
  TrendingUp,
  Search
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface Props {
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

interface Investment {
  id: string;
  userId: string;
  username: string;
  amount: number;
  status: 'pending' | 'approved' | 'completed' | 'declined';
  interestRate: number;
  releaseDate: Date | null;
  createdAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  declinedAt?: Date;
  adminNotes?: string;
}

export function InvestmentsAdmin({ setError, setMessage }: Props) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [interestRate, setInterestRate] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Listen to investment requests
    const investmentsQuery = query(
      collection(db, 'investments'),
      orderBy('createdAt', 'desc')
    );

    const unsubInvestments = onSnapshot(investmentsQuery, (snapshot) => {
      const investmentsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        releaseDate: doc.data().releaseDate?.toDate(),
        approvedAt: doc.data().approvedAt?.toDate(),
        completedAt: doc.data().completedAt?.toDate(),
        declinedAt: doc.data().declinedAt?.toDate()
      })) as Investment[];
      
      setInvestments(investmentsList);
    });

    return () => {
      unsubInvestments();
    };
  }, []);

  const handleApprove = (investment: Investment) => {
    setSelectedInvestment(investment);
    setInterestRate('');
    setReleaseDate('');
    setAdminNotes('');
    setIsDialogOpen(true);
  };

  const handleDecline = async (investment: Investment) => {
    if (!confirm(`Are you sure you want to decline this investment of ${investment.amount} FBT from ${investment.username}?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      // Get user data to return points
      const userRef = doc(db, 'users', investment.userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentPoints = userData.points || 0;
      
      // Update investment status
      await updateDoc(doc(db, 'investments', investment.id), {
        status: 'declined',
        declinedAt: new Date()
      });
      
      // Return points to user
      await updateDoc(userRef, {
        points: currentPoints + investment.amount
      });
      
      // Log transaction
      await addDoc(collection(db, 'transactions'), {
        userId: investment.userId,
        username: investment.username,
        amount: investment.amount,
        type: 'investment_declined',
        description: `Investment of ${investment.amount} points declined and refunded`,
        timestamp: new Date(),
        balanceAfter: {
          points: currentPoints + investment.amount,
          cash: userData.cash || 0
        }
      });
      
      setMessage(`Investment declined and ${investment.amount} points returned to ${investment.username}`);
    } catch (error) {
      console.error('Failed to decline investment:', error);
      setError('Failed to decline investment');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = async (investment: Investment) => {
    if (!confirm(`Are you sure you want to complete this investment and pay out ${investment.amount * (1 + investment.interestRate / 100)} FBT to ${investment.username}?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      // Get user data
      const userRef = doc(db, 'users', investment.userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentPoints = userData.points || 0;
      
      // Calculate payout amount with interest
      const payoutAmount = Math.floor(investment.amount * (1 + investment.interestRate / 100));
      
      // Update investment status
      await updateDoc(doc(db, 'investments', investment.id), {
        status: 'completed',
        completedAt: new Date()
      });
      
      // Add points to user
      await updateDoc(userRef, {
        points: currentPoints + payoutAmount
      });
      
      // Log transaction
      await addDoc(collection(db, 'transactions'), {
        userId: investment.userId,
        username: investment.username,
        amount: payoutAmount,
        type: 'investment_completed',
        description: `Investment of ${investment.amount} points completed with ${investment.interestRate}% interest (${payoutAmount - investment.amount} points profit)`,
        timestamp: new Date(),
        balanceAfter: {
          points: currentPoints + payoutAmount,
          cash: userData.cash || 0
        }
      });
      
      setMessage(`Investment completed and ${payoutAmount} points paid to ${investment.username}`);
    } catch (error) {
      console.error('Failed to complete investment:', error);
      setError('Failed to complete investment');
    } finally {
      setIsProcessing(false);
    }
  };

  const submitApproval = async () => {
    if (!selectedInvestment) return;
    
    const rate = parseFloat(interestRate);
    if (isNaN(rate) || rate <= 0) {
      setError('Please enter a valid interest rate');
      return;
    }
    
    const releaseDateTime = new Date(releaseDate);
    if (isNaN(releaseDateTime.getTime()) || releaseDateTime <= new Date()) {
      setError('Please enter a valid future release date');
      return;
    }
    
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'investments', selectedInvestment.id), {
        status: 'approved',
        interestRate: rate,
        releaseDate: releaseDateTime,
        adminNotes: adminNotes.trim() || null,
        approvedAt: new Date()
      });
      
      // Log transaction
      await addDoc(collection(db, 'transactions'), {
        userId: selectedInvestment.userId,
        username: selectedInvestment.username,
        type: 'investment_approved',
        description: `Investment of ${selectedInvestment.amount} points approved with ${rate}% interest rate`,
        timestamp: new Date()
      });
      
      setMessage(`Investment approved with ${rate}% interest rate`);
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Failed to approve investment:', error);
      setError('Failed to approve investment');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'Not set';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: Investment['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'declined':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: Investment['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'approved':
        return <TrendingUp className="h-4 w-4" />;
      case 'completed':
        return <Check className="h-4 w-4" />;
      case 'declined':
        return <X className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const calculateReturn = (investment: Investment) => {
    if (investment.status !== 'approved' || !investment.interestRate) return 0;
    return Math.floor(investment.amount * (1 + investment.interestRate / 100));
  };

  // Filter investments based on search query
  const filteredInvestments = searchQuery
    ? investments.filter(investment => 
        investment.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        investment.status.includes(searchQuery.toLowerCase())
      )
    : investments;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Investment Management</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by username or status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border pl-9 pr-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Investments List */}
      <div className="space-y-4">
        {filteredInvestments.map((investment) => (
          <div key={investment.id} className="rounded-lg bg-white p-4 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="mb-4 md:mb-0">
                <div className="flex items-center space-x-2">
                  <PiggyBank className="h-5 w-5 text-blue-500" />
                  <h3 className="text-lg font-semibold">{investment.username}</h3>
                  <span className={`flex items-center space-x-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(investment.status)}`}>
                    {getStatusIcon(investment.status)}
                    <span>{investment.status.charAt(0).toUpperCase() + investment.status.slice(1)}</span>
                  </span>
                </div>
                
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Amount:</span>
                    <span>{investment.amount} FBT</span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Created:</span>
                    <span>{formatDate(investment.createdAt)}</span>
                  </div>
                  
                  {investment.status === 'approved' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Interest Rate:</span>
                        <span>{investment.interestRate}%</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Release Date:</span>
                        <span>{formatDate(investment.releaseDate)}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Return:</span>
                        <span>{calculateReturn(investment)} FBT</span>
                      </div>
                    </>
                  )}
                  
                  {investment.adminNotes && (
                    <div className="col-span-2 rounded-md bg-gray-50 p-2 text-gray-700">
                      <p className="text-xs font-medium">Admin Notes:</p>
                      <p className="text-xs">{investment.adminNotes}</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex space-x-2">
                {investment.status === 'pending' && (
                  <>
                    <Button
                      onClick={() => handleApprove(investment)}
                      disabled={isProcessing}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleDecline(investment)}
                      disabled={isProcessing}
                      variant="outline"
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      Decline
                    </Button>
                  </>
                )}
                
                {investment.status === 'approved' && (
                  <Button
                    onClick={() => handleComplete(investment)}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Complete & Pay Out
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {filteredInvestments.length === 0 && (
          <div className="rounded-lg bg-white p-8 text-center shadow-md">
            <PiggyBank className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No investments found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? 'Try a different search term' : 'Investments will appear here when users make them'}
            </p>
          </div>
        )}
      </div>

      {/* Approval Dialog */}
      <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9999]" />
          <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-6 shadow-lg z-[10000]">
            <Dialog.Title className="text-xl font-semibold">
              Approve Investment
            </Dialog.Title>
            
            {selectedInvestment && (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">{selectedInvestment.username}</span> is investing <span className="font-medium">{selectedInvestment.amount} FBT</span>
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700">
                      Interest Rate (%)
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Percent className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input
                        id="interestRate"
                        type="number"
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        placeholder="Enter interest rate"
                        min="0.1"
                        step="0.1"
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700">
                      Release Date
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Calendar className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input
                        id="releaseDate"
                        type="datetime-local"
                        value={releaseDate}
                        onChange={(e) => setReleaseDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="adminNotes" className="block text-sm font-medium text-gray-700">
                      Admin Notes (Optional)
                    </label>
                    <textarea
                      id="adminNotes"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add notes about this investment"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={submitApproval}
                    disabled={isProcessing || !interestRate || !releaseDate}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isProcessing ? 'Processing...' : 'Approve Investment'}
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
