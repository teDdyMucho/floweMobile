import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs, addDoc, writeBatch, increment, orderBy, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, User, Users, CircleDollarSign, DollarSign, AlertCircle, Trash2, Ban, MessageSquare, Search } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { UserLogsDialog } from './user-logs-dialog';
import { SendMessageDialog } from './send-message-dialog';

interface Props {
  setError: (error: string) => void;
  setMessage: (message: string) => void;
}

interface User {
  id: string;
  username: string;
  points: number;
  cash: number;
  referralCode: string;
  referralCodeFriend: string;
  referrals: string[];
  approved: boolean;
  disabled?: boolean;
  gcashNumber?: string;
  isPaid?: boolean;
}

interface Request {
  id: string;
  userId: string;
  username: string;
  type: 'withdrawal' | 'loan';
  amount: number;
  status: 'pending' | 'approved' | 'declined';
  timestamp: Date;
  processedAt?: Date;
}

export function UsersAdmin({ setError, setMessage }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string } | null>(null);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [messageDialogState, setMessageDialogState] = useState<{ open: boolean; userId: string; username: string }>({
    open: false,
    userId: '',
    username: ''
  });
  const [requests, setRequests] = useState<Request[]>([]);
  const [showPendingApprovalOnly, setShowPendingApprovalOnly] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Request | null>(null);
  const [withdrawalFee, setWithdrawalFee] = useState('0');
  const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);

  useEffect(() => {
    // Listen to users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
      setUsers(usersList);
      setFilteredUsers(usersList);
    });

    // Listen to requests (loan/withdrawal pending)
    const requestsQuery = query(
      collection(db, 'requests'),
      where('status', '==', 'pending'),
      where('type', 'in', ['loan', 'withdrawal'])
    );

    const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
      const requestsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      })) as Request[];
      setRequests(requestsList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    });

    return () => {
      unsubUsers();
      unsubRequests();
    };
  }, []);

  useEffect(() => {
    let updatedUsers = [...users];

    if (searchQuery.trim()) {
      const queryText = searchQuery.trim().toLowerCase();
      updatedUsers = updatedUsers.filter(user => {
        const usernameMatch = user.username.toLowerCase().includes(queryText);
        const referralCodeMatch =
          typeof user.referralCode === 'string' &&
          user.referralCode.toLowerCase().includes(queryText);
        const referralCodeFriendMatch =
          typeof user.referralCodeFriend === 'string' &&
          user.referralCodeFriend.toLowerCase().includes(queryText);
        
        return usernameMatch || referralCodeMatch || referralCodeFriendMatch;
      });
    }

    // If toggled, filter only users pending approval.
    if (showPendingApprovalOnly) {
      updatedUsers = updatedUsers.filter(user => !user.approved);
    }

    setFilteredUsers(updatedUsers);
  }, [searchQuery, users, showPendingApprovalOnly]);

  const toggleUserType = async (userId: string, currentIsPaid: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isPaid: !currentIsPaid
      });
      setMessage(`User type updated to ${!currentIsPaid ? 'Paid' : 'Free'}`);
    } catch (err) {
      setError('Failed to update user type');
      console.error(err);
    }
  };

  const approveUser = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const batch = writeBatch(db);
      // Mark user as approved
      batch.update(userRef, { approved: true });

      // Multi-level referral system:
      // Bonus amounts for each level:
      // Level 1: 100, Level 2: 5, Level 3: 5, Level 4: 10, Level 5: 20
      const bonusLevels = [100, 5, 5, 10, 30];
      // Define which field to update for each level: level 1 credits points, levels 2-5 credit cash.
      const bonusGive = ['points', 'cash', 'cash', 'cash', 'cash'];
      let currentReferralCode = userData.referralCodeFriend;
      
      // Keep track of referrers who have already been rewarded to prevent duplicates
      const processedReferrers = new Set();
      
      for (let level = 0; level < bonusLevels.length; level++) {
        if (!currentReferralCode || currentReferralCode === 'Not set') break;
        
        const referrerQuery = query(
          collection(db, 'users'),
          where('referralCode', '==', currentReferralCode)
        );
        const referrerSnapshot = await getDocs(referrerQuery);
        if (referrerSnapshot.empty) break;
      
        const referrerDoc = referrerSnapshot.docs[0];
        const referrerId = referrerDoc.id;
        
        // Skip if this referrer has already been processed (prevents double rewards)
        if (processedReferrers.has(referrerId)) {
          console.log(`Skipping duplicate referrer: ${referrerId} at level ${level + 1}`);
          break; // Exit the loop as we've hit a cycle in the referral chain
        }
        
        // Mark this referrer as processed
        processedReferrers.add(referrerId);
        
        const referrerData = referrerDoc.data();
      
        // Update the referrer's document:
        // - Add the approved user's ID to their referrals array.
        // - Credit bonus to the appropriate field (points or cash) for the current level.
        batch.update(referrerDoc.ref, {
          referrals: arrayUnion(userId),
          [bonusGive[level]]: increment(bonusLevels[level])
        });
      
        // Log the referral bonus as a transaction.
        const transactionRef = doc(collection(db, 'transactions'));
        batch.set(transactionRef, {
          userId: referrerDoc.id,
          username: referrerData.username,
          amount: bonusLevels[level],
          type: `referral_bonus_level_${level + 1}`,
          description: `Referral bonus for level ${level + 1} awarded: ${bonusLevels[level]} ${bonusGive[level]}`,
          timestamp: new Date(),
          balanceAfter: {
            points: (referrerData.points || 0) + (bonusGive[level] === 'points' ? bonusLevels[level] : 0),
            cash: (referrerData.cash || 0) + (bonusGive[level] === 'cash' ? bonusLevels[level] : 0)
          }
        });
        
        // Move up the chain using the current referrer's referralCodeFriend.
        currentReferralCode = referrerData.referralCodeFriend;
      }

      await batch.commit();
      setMessage('User approved successfully');
    } catch (err) {
      setError('Failed to approve user');
      console.error(err);
    }
  };

  const toggleDisableUser = async (userId: string, currentDisabledState: boolean) => {
    if (!confirm(`Are you sure you want to ${currentDisabledState ? 'enable' : 'disable'} this user?`)) {
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        disabled: !currentDisabledState
      });
      setMessage(`User ${currentDisabledState ? 'enabled' : 'disabled'} successfully`);
    } catch (err) {
      setError(`Failed to ${currentDisabledState ? 'enable' : 'disable'} user`);
      console.error(err);
    }
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to permanently delete user ${username}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', userId));

      await addDoc(collection(db, 'transactions'), {
        userId,
        username,
        type: 'user_deleted',
        description: 'User account deleted by admin',
        timestamp: new Date()
      });

      setMessage('User deleted successfully');
    } catch (err) {
      setError('Failed to delete user');
      console.error(err);
    }
  };

  const updateUserBalance = async (userId: string, type: 'points' | 'cash') => {
    const newAmount = prompt(`Enter new ${type} amount:`);
    if (newAmount === null) return;

    const amount = parseInt(newAmount);
    if (isNaN(amount)) {
      setError('Please enter a valid number');
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();
      const currentAmount = userData[type] || 0;
      const difference = amount - currentAmount;

      await updateDoc(userRef, {
        [type]: increment(difference)
      });

      await addDoc(collection(db, 'transactions'), {
        userId,
        username: userData.username,
        amount: difference,
        type: `admin_${type}_update`,
        description: `Admin adjusted ${type} by ${difference >= 0 ? '+' : ''}${difference}`,
        timestamp: new Date()
      });

      setMessage(`User ${type} updated successfully`);
    } catch (err) {
      setError(`Failed to update user ${type}`);
      console.error(err);
    }
  };

  const showUserLogs = (user: User) => {
    setSelectedUser({ id: user.id, username: user.username });
    setIsLogsOpen(true);
  };

  const openMessageDialog = (userId: string, username: string) => {
    setMessageDialogState({
      open: true,
      userId,
      username
    });
  };

  const handleRequest = async (requestId: string, approve: boolean) => {
    const request = requests.find(r => r.id === requestId);
    if (!request) {
      setError('Request not found');
      return;
    }

    if (request.type === 'withdrawal' && approve) {
      setSelectedWithdrawal(request);
      setWithdrawalFee('0');
      setIsWithdrawalDialogOpen(true);
      return;
    }

    processRequest(request, approve);
  };

  const processRequest = async (request: Request, approve: boolean, fee: number = 0) => {
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const requestRef = doc(db, 'requests', request.id);
      const userRef = doc(db, 'users', request.userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();

      if (approve) {
        if (request.type === 'withdrawal') {
          // Apply transaction fee if set
          const finalAmount = request.amount;
          const feeAmount = fee;

          batch.update(requestRef, {
            status: 'approved',
            processedAt: new Date(),
            fee: feeAmount
          });

          // Log transaction with fee information
          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            userId: request.userId,
            username: request.username,
            amount: -finalAmount,
            fee: feeAmount,
            type: 'withdrawal_approved',
            description: feeAmount > 0 
              ? `Cash withdrawal approved (Fee: ${feeAmount})`
              : 'Cash withdrawal approved',
            timestamp: new Date(),
            balanceAfter: {
              points: userData.points || 0,
              cash: userData.cash || 0
            }
          });
        } else if (request.type === 'loan') {
          batch.update(userRef, {
            points: increment(request.amount)
          });

          batch.update(requestRef, {
            status: 'approved',
            processedAt: new Date()
          });

          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            userId: request.userId,
            username: request.username,
            amount: request.amount,
            type: 'loan_approved',
            description: 'FBT loan approved',
            timestamp: new Date(),
            balanceAfter: {
              points: (userData.points || 0) + request.amount,
              cash: userData.cash || 0
            }
          });
        }
      } else {
        if (request.type === 'withdrawal') {
          batch.update(userRef, {
            cash: increment(request.amount)
          });

          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            userId: request.userId,
            username: request.username,
            amount: request.amount,
            type: 'withdrawal_declined',
            description: 'Cash withdrawal declined - amount returned',
            timestamp: new Date(),
            balanceAfter: {
              points: userData.points || 0,
              cash: (userData.cash || 0) + request.amount
            }
          });
        }

        batch.update(requestRef, {
          status: 'declined',
          processedAt: new Date()
        });
      }

      await batch.commit();
      setMessage(`Request ${approve ? 'approved' : 'declined'} successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdrawalApproval = () => {
    if (!selectedWithdrawal) return;
    
    const fee = parseFloat(withdrawalFee);
    if (isNaN(fee) || fee < 0) {
      setError('Please enter a valid transaction fee');
      return;
    }
    
    setIsWithdrawalDialogOpen(false);
    processRequest(selectedWithdrawal, true, fee);
  };

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      {requests.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold">Pending Requests</h2>
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col items-start justify-between space-y-4 rounded-lg border p-4 md:flex-row md:items-center md:space-y-0"
              >
                <div className="flex items-center space-x-4">
                  {request.type === 'withdrawal' ? (
                    <DollarSign className="h-8 w-8 text-green-500" />
                  ) : (
                    <CircleDollarSign className="h-8 w-8 text-blue-500" />
                  )}
                  <div>
                    <p className="font-medium">{request.username}</p>
                    <p className="text-sm text-gray-600">
                      {request.type === 'withdrawal'
                        ? 'Cash Withdrawal'
                        : 'FBT Loan'}: {request.amount}{' '}
                      {request.type === 'withdrawal' ? 'Cash' : 'FBT'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {request.timestamp.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => handleRequest(request.id, true)}
                    disabled={isProcessing}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleRequest(request.id, false)}
                    disabled={isProcessing}
                    size="sm"
                    variant="outline"
                    className="border-red-500 text-red-600 hover:bg-red-50"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Management */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Users Management</h2>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-md border border-gray-300 pl-9 pr-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-2"
              />
            </div>
            <button
              onClick={() => setShowPendingApprovalOnly(prev => !prev)}
              className="rounded-md bg-gray-200 px-3 py-1 text-sm"
            >
              {showPendingApprovalOnly ? 'Show All Users' : 'Show Pending Approval'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Cash
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  GCash
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Refer By:
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Ref.Cd
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => showUserLogs(user)}
                  className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                    user.disabled ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    {user.username}
                    <div className="flex space-x-2">
                      {user.disabled && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                          Disabled
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">{user.points}</td>
                  <td className="whitespace-nowrap px-6 py-4">{user.cash || 0}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {user.gcashNumber || 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {user.referralCodeFriend || 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {user.referralCode || 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUserType(user.id, user.isPaid || false);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        user.isPaid ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          user.isPaid ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                      <span className="sr-only">{user.isPaid ? 'Paid' : 'Free'}</span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                      {!user.approved && (
                        <Button
                          onClick={() => approveUser(user.id)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Approve
                        </Button>
                      )}
                      <Button onClick={() => updateUserBalance(user.id, 'points')} size="sm">
                        FBT
                      </Button>
                      <Button onClick={() => updateUserBalance(user.id, 'cash')} size="sm">
                        Cash
                      </Button>
                      <Button
                        onClick={() => openMessageDialog(user.id, user.username)}
                        size="sm"
                        variant="outline"
                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                      >
                        <MessageSquare className="mr-1 h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => deleteUser(user.id, user.username)}
                        size="sm"
                        variant="outline"
                        className="border-red-500 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => toggleDisableUser(user.id, user.disabled || false)}
                        size="sm"
                        variant="outline"
                        className={
                          user.disabled
                            ? 'border-green-500 text-green-600'
                            : 'border-red-500 text-red-600'
                        }
                      >
                        <Ban className="mr-1 h-4 w-4" />
                        {user.disabled ? 'Enable' : 'Disable'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser && (
        <UserLogsDialog
          userId={selectedUser.id}
          username={selectedUser.username}
          open={isLogsOpen}
          onOpenChange={setIsLogsOpen}
        />
      )}

      <SendMessageDialog
        userId={messageDialogState.userId}
        username={messageDialogState.username}
        open={messageDialogState.open}
        onOpenChange={(open) => setMessageDialogState((prev) => ({ ...prev, open }))}
        onMessageSent={() => {
          setMessage('Message sent successfully');
        }}
      />

      {/* Withdrawal Fee Dialog */}
      <Dialog.Root open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9999]" />
          <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-6 shadow-lg z-[10000]">
            <Dialog.Title className="text-xl font-semibold">
              Set Withdrawal Fee
            </Dialog.Title>
            
            {selectedWithdrawal && (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">{selectedWithdrawal.username}</span> is withdrawing <span className="font-medium">{selectedWithdrawal.amount} Cash</span>
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label htmlFor="withdrawalFee" className="block text-sm font-medium text-gray-700">
                      Transaction Fee
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <DollarSign className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input
                        id="withdrawalFee"
                        type="number"
                        value={withdrawalFee}
                        onChange={(e) => setWithdrawalFee(e.target.value)}
                        placeholder="Enter fee amount"
                        min="0"
                        step="1"
                        className="pl-10"
                        required
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Set to 0 for no transaction fee
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsWithdrawalDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleWithdrawalApproval}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isProcessing ? 'Processing...' : 'Approve Withdrawal'}
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
