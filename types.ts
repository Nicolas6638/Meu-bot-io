export type BlazeColor = 'red' | 'black' | 'white';

export interface BlazeRoll {
  id: string;
  color: BlazeColor;
  number: number;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'signal' | 'win' | 'loss' | 'gale';
  message: string;
  detail?: string;
}

export interface StrategyResult {
  enter: boolean;
  targetColor?: BlazeColor;
  patternName?: string;
}

export interface Pattern {
  name: string;
  sequence: string[]; // Ex: ['V', 'V', 'X']
  target: BlazeColor;
}

export interface BotStats {
  wins: number;
  losses: number;
  winsNormal: number;
  winsGale: number;
  consecutiveWins: number;
  maxConsecutiveWins: number;
  totalSignals: number;
}

export interface BotConfig {
  telegramToken: string;
  chatId: string;
  stickerWin?: string;
  stickerLoss?: string;
  stickerSignal?: string;
  martingaleSteps: number;
  sequenceLimit: number; // Mantido para compatibilidade, mas estratégia usará padrões
}
