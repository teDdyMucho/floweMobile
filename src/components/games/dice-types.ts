export type DiceColor = 'none' | 'white' | 'red' | 'green';

export interface DiceRound {
  id: string;
  status: 'open' | 'closed';
  numberColors: { [num: number]: DiceColor }; // 1-6
  createdAt: Date;
  closedAt?: Date;
}

export interface DiceBet {
  id: string;
  userId: string;
  username: string;
  roundId: string;
  chosenNumber: number;
  amount: number;
  status: 'pending' | 'won' | 'lost';
  resultNumbers?: number[];
  createdAt: Date;
  resolvedAt?: Date;
  payout?: number;
}
