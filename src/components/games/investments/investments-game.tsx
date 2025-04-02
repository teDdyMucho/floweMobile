import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Percent, PiggyBank, Clock, TrendingUp, Check, X, Timer } from 'lucide-react';

interface InvestmentProps {
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
  releaseDate: Date;
  createdAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  declinedAt?: Date;
  adminNotes?: string;
}

export function InvestmentsGame({ setError, setMessage }: InvestmentProps) {
  const { user } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalInvested, setTotalInvested] = useState(0);
  const [pendingReturns, setPendingReturns] = useState(0);
  const [countdowns, setCountdowns] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;

    // Listen to user's investments
    const investmentsQuery = query(
      collection(db, 'investments'),
      where('userId', '==', user.id),
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
      
      // Calculate totals
      let invested = 0;
      let pending = 0;
      
      investmentsList.forEach(investment => {
        if (investment.status === 'approved') {
          invested += investment.amount;
          pending += investment.amount * (1 + investment.interestRate / 100);
        }
      });
      
      setTotalInvested(invested);
      setPendingReturns(pending);
    });

    return () => {
      unsubInvestments();
    };
  }, [user?.id]);

  // Update countdowns every second
  useEffect(() => {
    const updateCountdowns = () => {
      const now = new Date();
      const newCountdowns: Record<string, string> = {};
      
      investments.forEach(investment => {
        if (investment.status === 'approved' && investment.releaseDate) {
          const releaseTime = investment.releaseDate.getTime();
          const currentTime = now.getTime();
          const timeRemaining = releaseTime - currentTime;
          
          if (timeRemaining <= 0) {
            newCountdowns[investment.id] = 'Ready for payout!';
          } else {
            // Calculate days, hours, minutes, seconds
            const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            if (days > 0) {
              newCountdowns[investment.id] = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            } else {
              newCountdowns[investment.id] = `${hours}h ${minutes}m ${seconds}s`;
            }
          }
        }
      });
      
      setCountdowns(newCountdowns);
    };
    
    // Initial update
    updateCountdowns();
    
    // Set interval for updates
    const intervalId = setInterval(updateCountdowns, 1000);
    
    // Clear interval on component unmount
    return () => clearInterval(intervalId);
  }, [investments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to invest');
      return;
    }
    
    const investmentAmount = parseInt(amount);
    if (isNaN(investmentAmount) || investmentAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (investmentAmount > user.points) {
      setError('Insufficient points for this investment');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Create investment request
      await addDoc(collection(db, 'investments'), {
        userId: user.id,
        username: user.username,
        amount: investmentAmount,
        status: 'pending',
        interestRate: 0, // Will be set by admin
        releaseDate: null, // Will be set by admin
        createdAt: serverTimestamp()
      });
      
      // Deduct points from user
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        points: user.points - investmentAmount
      });
      
      // Log transaction
      await addDoc(collection(db, 'transactions'), {
        userId: user.id,
        username: user.username,
        amount: -investmentAmount,
        type: 'investment_created',
        description: `Investment of ${investmentAmount} points created`,
        timestamp: new Date(),
        balanceAfter: {
          points: user.points - investmentAmount,
          cash: user.cash || 0
        }
      });
      
      setMessage('Investment request submitted successfully');
      setAmount('');
    } catch (error) {
      console.error('Failed to create investment:', error);
      setError('Failed to create investment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Not set';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
    if (investment.status !== 'approved') return 0;
    return investment.amount * (1 + investment.interestRate / 100);
  };

  return (
    <div className="space-y-6">
      {/* Investment Instructions */}
      <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-6 text-white shadow-lg">
        <h2 className="mb-4 text-2xl font-bold">Secure Investments</h2>
        <div className="space-y-3">
          <p className="text-white/90">
            Invest your FBT points with the bank and earn interest over time. Your investment is secure and guaranteed.
          </p>
          <ul className="list-inside list-disc space-y-2 text-white/90">
            <li>Submit your investment request with any amount of points</li>
            <li>The bank will approve your request and set an interest rate</li>
            <li>Your investment will mature on the release date</li>
            <li>Receive your initial investment plus interest on maturity</li>
          </ul>
        </div>
      </div>

      {/* Investment Form */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h3 className="mb-4 text-xl font-semibold">Create New Investment</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
              Investment Amount (FBT Points)
            </label>
            <div className="mt-1 flex items-center">
              <PiggyBank className="mr-2 h-5 w-5 text-gray-400" />
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount to invest"
                min="1"
                max={user?.points?.toString()}
                className="flex-1"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Available: {user?.points || 0} points
            </p>
          </div>
          
          <Button
            type="submit"
            disabled={isSubmitting || !amount || parseInt(amount) <= 0 || parseInt(amount) > (user?.points || 0)}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? 'Processing...' : 'Submit Investment Request'}
          </Button>
        </form>
      </div>

      {/* Investment Summary */}
      {investments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-4 shadow-md">
            <div className="flex items-center space-x-2">
              <PiggyBank className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-semibold">Total Invested</h3>
            </div>
            <p className="mt-2 text-2xl font-bold">{totalInvested} FBT</p>
          </div>
          
          <div className="rounded-lg bg-white p-4 shadow-md">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <h3 className="text-lg font-semibold">Pending Returns</h3>
            </div>
            <p className="mt-2 text-2xl font-bold">{pendingReturns.toFixed(0)} FBT</p>
          </div>
        </div>
      )}

      {/* Investments List */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h3 className="mb-4 text-xl font-semibold">Your Investments</h3>
        
        {investments.length > 0 ? (
          <div className="space-y-4">
            {investments.map((investment) => (
              <div key={investment.id} className="rounded-lg border p-4">
                <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg font-semibold">{investment.amount} FBT</span>
                      <span className={`flex items-center space-x-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(investment.status)}`}>
                        {getStatusIcon(investment.status)}
                        <span>{investment.status.charAt(0).toUpperCase() + investment.status.slice(1)}</span>
                      </span>
                    </div>
                    
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>Created: {formatDate(investment.createdAt)}</span>
                      </div>
                      
                      {investment.status === 'approved' && (
                        <>
                          <div className="flex items-center space-x-2">
                            <Percent className="h-4 w-4" />
                            <span>Interest Rate: {investment.interestRate}%</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4" />
                            <span>Release Date: {formatDate(investment.releaseDate)}</span>
                          </div>
                          {countdowns[investment.id] && (
                            <div className="flex items-center space-x-2">
                              <Timer className="h-4 w-4 text-blue-500" />
                              <span className="font-medium text-blue-600">Time Remaining: {countdowns[investment.id]}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-2">
                            <TrendingUp className="h-4 w-4" />
                            <span>Expected Return: {calculateReturn(investment).toFixed(0)} FBT</span>
                          </div>
                        </>
                      )}
                      
                      {investment.adminNotes && (
                        <div className="mt-2 rounded-md bg-gray-50 p-2 text-gray-700">
                          <p className="text-xs font-medium">Admin Notes:</p>
                          <p className="text-xs">{investment.adminNotes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <PiggyBank className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No investments yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Start investing to grow your FBT points
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
