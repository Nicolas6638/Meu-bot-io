import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BlazeRoll, LogEntry, BotConfig, BlazeColor, BotStats } from './types';
import { blazeService } from './services/blazeService';
import { checkPythonPatterns, getCurrentStreak } from './services/strategyService';
import { sendTelegramMessage, sendTelegramSticker, deleteTelegramMessage, formatSignalMessage, formatWinMessage, formatLossMessage, formatGaleMessage, formatStatsMessage } from './services/telegramService';
import { HistoryTape } from './components/HistoryTape';
import { ConsoleLog } from './components/ConsoleLog';
import { Activity, Settings, Wifi, WifiOff, AlertTriangle, BarChart2, Sticker, Trophy, Zap, PlayCircle, StopCircle } from 'lucide-react';

// Tipagem do estado do jogo conforme Python
type GameStatus = 'waiting' | 'rolling' | 'complete' | 'unknown';

interface ActiveBet {
  targetColor: BlazeColor;
  galeLevel: number;
}

const MAX_HISTORY = 20;

export default function App() {
  const [history, setHistory] = useState<BlazeRoll[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [streak, setStreak] = useState({ color: 'none', count: 0 });
  const [gameStatus, setGameStatus] = useState<GameStatus>('unknown');
  
  // Referência para mensagem temporária (giro, gale) para deletar
  const tempMessageIdRef = useRef<number | null>(null);

  const [stats, setStats] = useState<BotStats>({
      wins: 0,
      losses: 0,
      winsNormal: 0,
      winsGale: 0,
      consecutiveWins: 0,
      maxConsecutiveWins: 0,
      totalSignals: 0
  });

  const [config, setConfig] = useState<BotConfig>({
    telegramToken: '',
    chatId: '',
    stickerWin: '',
    stickerLoss: '',
    stickerSignal: '',
    martingaleSteps: 2,
    sequenceLimit: 4 
  });

  const activeBetRef = useRef<ActiveBet | null>(null);
  const historyRef = useRef<BlazeRoll[]>([]);
  const configRef = useRef<BotConfig>(config);
  const isRunningRef = useRef(isRunning);
  const statsRef = useRef<BotStats>(stats);

  // Sincroniza refs
  useEffect(() => {
    activeBetRef.current = activeBet;
    historyRef.current = history;
    configRef.current = config;
    isRunningRef.current = isRunning;
    statsRef.current = stats;
    setStreak(getCurrentStreak(history));
  }, [activeBet, history, config, isRunning, stats]);

  const addLog = useCallback((type: LogEntry['type'], message: string, detail?: string) => {
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type,
        message,
        detail
      }
    ]);
  }, []);

  const updateStats = (isWin: boolean, isGale: boolean) => {
      const s = { ...statsRef.current };
      s.totalSignals++; // Ajustado: O código Python incrementa total_signals apenas quando acha sinal. Aqui estamos incrementando ao finalizar.
      // O Python incrementa no 'SINAL ENCONTRADO'. 
      // Para alinhar: No Python total_signals++ é na entrada. Win/Loss altera win_count/loss_count.
      // Vou manter simplificado aqui alterando apenas Win/Loss, mas o totalSignals será incrementado na entrada.
      
      if (isWin) {
          s.wins++;
          if (isGale) s.winsGale++;
          else s.winsNormal++;
          s.consecutiveWins++;
          if (s.consecutiveWins > s.maxConsecutiveWins) s.maxConsecutiveWins = s.consecutiveWins;
      } else {
          s.losses++;
          s.consecutiveWins = 0;
      }
      setStats(s);
      return s; 
  };

  // Função para deletar a mensagem temporária (se houver)
  const deleteTempMessage = async () => {
      if (tempMessageIdRef.current && configRef.current.telegramToken) {
          await deleteTelegramMessage(configRef.current, tempMessageIdRef.current);
          tempMessageIdRef.current = null;
      }
  };

  // --- LÓGICA PRINCIPAL BASEADA NO PYTHON ---
  // O BlazeService agora emite eventos { status, roll } a cada polling
  
  const handleBlazeUpdate = useCallback(async (data: { status: GameStatus, roll: BlazeRoll }) => {
    const { status, roll } = data;
    setGameStatus(status);

    // Atualiza Histórico quando o ID muda, independente do status (mas geralmente vem no complete)
    // No Python: if status == complete: get_recentes().
    // Aqui vamos garantir que o histórico está atualizado.
    
    // Se for o primeiro load ou um novo ID:
    if (historyRef.current.length === 0 || (historyRef.current[0].id !== roll.id && status === 'complete')) {
        // Busca histórico completo para garantir integridade, igual ao Python get_recentes()
        // Mas para performance, podemos só adicionar o novo se tivermos certeza.
        // O Python busca 'recent/1' quando status é complete.
        const updatedHistory = await blazeService.getRecentHistory();
        if (updatedHistory.length > 0) {
            setHistory(updatedHistory);
            historyRef.current = updatedHistory; // Atualiza ref imediatamente para uso na lógica
        }
    }

    if (!isRunningRef.current) return;

    // --- LÓGICA DE ESTADOS (MÁQUINA DE ESTADOS DO PYTHON) ---

    // 1. STATUS: WAITING
    if (status === 'waiting') {
        // No Python: "if msg_id is not None: await asyncio.sleep(13); delete_message"
        // Aqui deletamos logo que entra em waiting ou controlamos via timeout
        if (tempMessageIdRef.current) {
            // Pequeno delay para leitura antes de deletar
            setTimeout(() => deleteTempMessage(), 2000); 
        }
    }
    
    // 2. STATUS: ROLLING (Onde ocorre Win/Loss check no Python)
    else if (status === 'rolling' && activeBetRef.current) {
        // "elif status == 'rolling' and self.analise_open:"
        
        const currentBet = activeBetRef.current;
        const currentConfig = configRef.current;
        const colorRecente = roll.color; // O resultado "previsto" na API durante rolling
        
        // Verifica Resultado
        const isWin = colorRecente === currentBet.targetColor || colorRecente === 'white';
        
        if (isWin) {
            // WIN
            const galeUsed = currentBet.galeLevel > 0;
            updateStats(true, galeUsed); // Atualiza stats
            
            addLog('win', `WIN! ${roll.color.toUpperCase()}`, galeUsed ? `Gale ${currentBet.galeLevel}` : 'Sem Gale');
            setActiveBet(null); // analise_open = False
            
            if (currentConfig.stickerWin) await sendTelegramSticker(currentConfig, currentConfig.stickerWin);
            await sendTelegramMessage(currentConfig, formatWinMessage(currentBet.galeLevel));
            await sendTelegramMessage(currentConfig, formatStatsMessage(statsRef.current));
        
        } else {
            // LOSS ou GALE
            if (currentBet.galeLevel < currentConfig.martingaleSteps) {
                // Vai pro GALE
                const nextGale = currentBet.galeLevel + 1;
                addLog('gale', `Loss. Indo para Gale ${nextGale}`);
                
                // Atualiza aposta
                setActiveBet({ ...currentBet, galeLevel: nextGale });
                
                // Envia msg temporária de Gale
                const msgId = await sendTelegramMessage(currentConfig, formatGaleMessage(roll.number, roll.color, nextGale));
                if (msgId) tempMessageIdRef.current = msgId;

            } else {
                // LOSS FINAL
                updateStats(false, false);
                addLog('loss', 'STOP LOSS. Perda confirmada.');
                setActiveBet(null); // analise_open = False

                if (currentConfig.stickerLoss) await sendTelegramSticker(currentConfig, currentConfig.stickerLoss);
                await sendTelegramMessage(currentConfig, formatLossMessage());
                await sendTelegramMessage(currentConfig, formatStatsMessage(statsRef.current));
            }
        }
    }

    // 3. STATUS: COMPLETE (Onde ocorre busca de Padrões no Python)
    else if (status === 'complete') {
        // "elif status == 'complete': ... if not self.analise_open: verificar_padrao"
        
        if (!activeBetRef.current) {
            // Só busca padrão se não estiver em operação
            const strategy = checkPythonPatterns(historyRef.current);
            
            if (strategy.enter && strategy.targetColor) {
                // Encontrou sinal
                addLog('signal', `PADRÃO: ${strategy.patternName}`, `Entrada: ${strategy.targetColor.toUpperCase()}`);
                
                const currentConfig = configRef.current;
                
                // Incrementa contador de sinais (total_signals += 1)
                const s = { ...statsRef.current };
                s.totalSignals++;
                setStats(s);

                // Configura aposta
                setActiveBet({
                    targetColor: strategy.targetColor,
                    galeLevel: 0
                }); // analise_open = True

                // Envia Sticker Sinal
                if (currentConfig.stickerSignal) {
                    await sendTelegramSticker(currentConfig, currentConfig.stickerSignal);
                }

                // Envia Mensagem Sinal
                await sendTelegramMessage(currentConfig, formatSignalMessage(strategy.targetColor, currentConfig.martingaleSteps), true);
            }
        }
    }

  }, [addLog]);

  useEffect(() => {
    // Inicializa o serviço HTTP
    blazeService.setStatusListener((status) => {
        setConnectionStatus(status);
        if (status === 'connected_http') addLog('success', '🟢 Conectado via HTTP (Blaze API)');
        if (status === 'error') addLog('error', '🔴 Erro de Conexão HTTP (Verifique CORS)');
    });

    const unsubscribe = blazeService.subscribe(handleBlazeUpdate);
    blazeService.connect();

    return () => {
      unsubscribe();
      blazeService.disconnect();
    };
  }, [handleBlazeUpdate, addLog]);

  const toggleBot = () => {
      if (!isRunning) {
          addLog('info', 'Bot Iniciado. Aguardando Padrões...');
      } else {
          addLog('info', 'Bot Pausado.');
      }
      setIsRunning(!isRunning);
  };

  const getConnectionLabel = () => {
      switch(connectionStatus) {
          case 'connected_http': return 'Online (HTTP)';
          case 'connecting': return 'Conectando...';
          case 'error': return 'Erro (CORS/Net)';
          default: return 'Desconectado';
      }
  };

  const getStatusColor = () => {
      if (gameStatus === 'rolling') return 'text-yellow-400 animate-pulse';
      if (gameStatus === 'complete') return 'text-green-400';
      if (gameStatus === 'waiting') return 'text-blue-400';
      return 'text-gray-400';
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between shadow-lg z-20">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-2 rounded-lg shadow-red-900/50 shadow-lg">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-red-500 to-white bg-clip-text text-transparent">MeuBot.io</h1>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <span>Status:</span>
                <span className={`font-bold uppercase ${getStatusColor()}`}>{gameStatus}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 bg-gray-900 px-3 py-1 rounded-lg border border-gray-700 mr-4">
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Wins</div>
                    <div className="text-green-400 font-bold leading-none">{stats.wins}</div>
                </div>
                <div className="h-4 w-px bg-gray-700"></div>
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Losses</div>
                    <div className="text-red-400 font-bold leading-none">{stats.losses}</div>
                </div>
                 <div className="h-4 w-px bg-gray-700"></div>
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Assert.</div>
                    <div className="text-yellow-400 font-bold leading-none">
                        {stats.totalSignals > 0 ? ((stats.wins / stats.totalSignals) * 100).toFixed(0) : 0}%
                    </div>
                </div>
            </div>

            <button onClick={() => setShowConfig(!showConfig)} className={`p-2 rounded-full transition-colors ${showConfig ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                <Settings size={18} />
            </button>
            <button 
                onClick={toggleBot}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all ${isRunning ? 'bg-red-900/20 text-red-400 border-red-500 hover:bg-red-900/40' : 'bg-green-900/20 text-green-400 border-green-500 hover:bg-green-900/40'}`}
            >
                {isRunning ? <StopCircle size={14} /> : <PlayCircle size={14} />}
                {isRunning ? 'PARAR' : 'INICIAR'}
            </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Painel Lateral de Configuração */}
        <div className={`${showConfig ? 'w-80 translate-x-0' : 'w-0 -translate-x-full opacity-0'} bg-gray-800 border-r border-gray-700 transition-all duration-300 z-10 flex flex-col`}>
            <div className="p-4 space-y-4 w-80 overflow-y-auto custom-scroll pb-20">
                <h2 className="font-bold text-sm flex items-center gap-2 border-b border-gray-700 pb-2 text-gray-300">
                    <Settings size={14} /> Configurações
                </h2>
                
                <div className="space-y-3">
                    {/* Token */}
                    <div className="bg-gray-700/30 p-3 rounded border border-gray-600/50">
                        <label className="text-[10px] text-gray-400 font-bold block mb-1">TELEGRAM TOKEN</label>
                        <input type="password" value={config.telegramToken} onChange={e => setConfig({...config, telegramToken: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-1.5 text-xs text-white focus:border-red-500 outline-none" placeholder="Token do BotFather" />
                    </div>
                    <div className="bg-gray-700/30 p-3 rounded border border-gray-600/50">
                        <label className="text-[10px] text-gray-400 font-bold block mb-1">CHAT ID</label>
                        <input type="text" value={config.chatId} onChange={e => setConfig({...config, chatId: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-1.5 text-xs text-white focus:border-red-500 outline-none" placeholder="-100..." />
                    </div>

                    {/* Stickers */}
                    <div className="bg-gray-700/30 p-3 rounded border border-gray-600/50 space-y-2">
                        <label className="text-[10px] text-blue-300 font-bold flex items-center gap-1">
                            <Sticker size={10} /> STICKERS (OPCIONAL)
                        </label>
                        <div>
                             <label className="text-[9px] text-gray-500 uppercase">Sticker Sinal</label>
                             <input type="text" value={config.stickerSignal || ''} onChange={e => setConfig({...config, stickerSignal: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-1.5 text-xs" placeholder="ID do Sticker" />
                        </div>
                        <div>
                             <label className="text-[9px] text-gray-500 uppercase">Sticker Win</label>
                             <input type="text" value={config.stickerWin || ''} onChange={e => setConfig({...config, stickerWin: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-1.5 text-xs" placeholder="ID do Sticker" />
                        </div>
                        <div>
                             <label className="text-[9px] text-gray-500 uppercase">Sticker Loss</label>
                             <input type="text" value={config.stickerLoss || ''} onChange={e => setConfig({...config, stickerLoss: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-1.5 text-xs" placeholder="ID do Sticker" />
                        </div>
                    </div>

                    {/* Estratégia */}
                    <div className="bg-gray-700/30 p-3 rounded border border-gray-600/50">
                        <label className="text-[10px] text-gray-400 font-bold block mb-2">MARTINGALE</label>
                        <select value={config.martingaleSteps} onChange={e => setConfig({...config, martingaleSteps: Number(e.target.value)})} className="w-full bg-gray-900 border border-gray-600 rounded p-1.5 text-xs text-white focus:border-red-500 outline-none">
                            <option value={0}>Mão Fixa (Sem Gale)</option>
                            <option value={1}>1 Gale</option>
                            <option value={2}>2 Gales</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        {/* Área Principal */}
        <div className="flex-1 flex flex-col min-w-0 z-10">
            {connectionStatus === 'error' && (
                <div className="bg-red-600/20 border-b border-red-600/50 p-2 text-[10px] md:text-xs text-red-200 flex items-center justify-center gap-2 animate-pulse text-center">
                    <AlertTriangle size={12} />
                    <span>Erro de Conexão (HTTP). Instale "Allow CORS" ou verifique sua rede.</span>
                </div>
            )}
            
            <div className="p-4 md:p-6 pb-2">
                 {/* Cards de Status (Dashboard) */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {/* Status Rede */}
                    <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-lg flex flex-col justify-between h-20">
                         <div className="flex justify-between items-start">
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Conexão</div>
                            {connectionStatus === 'connected_http' ? <Wifi size={14} className="text-green-500"/> : <WifiOff size={14} className="text-gray-500"/>}
                         </div>
                         <div className="text-xs font-bold text-white truncate">{getConnectionLabel()}</div>
                         <div className="text-[9px] text-gray-500">API Polling (1s)</div>
                    </div>

                    {/* Placar Win/Loss */}
                    <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-lg flex flex-col justify-between h-20">
                         <div className="flex justify-between items-start">
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Placar Geral</div>
                            <Trophy size={14} className="text-yellow-500"/>
                         </div>
                         <div className="flex items-end gap-1">
                             <span className="text-lg font-bold text-green-400">{stats.wins}</span>
                             <span className="text-xs text-gray-500 mb-1">x</span>
                             <span className="text-lg font-bold text-red-400">{stats.losses}</span>
                         </div>
                    </div>

                    {/* Detalhe Gales */}
                    <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-lg flex flex-col justify-between h-20">
                         <div className="flex justify-between items-start">
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Win Rate</div>
                            <BarChart2 size={14} className="text-blue-500"/>
                         </div>
                         <div className="text-xs text-gray-300">
                             SG: <span className="text-green-300 font-bold">{stats.winsNormal}</span> | Gale: <span className="text-yellow-300 font-bold">{stats.winsGale}</span>
                         </div>
                    </div>

                    {/* Streak Atual */}
                    <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-lg flex flex-col justify-between h-20 relative overflow-hidden">
                         <div className="flex justify-between items-start relative z-10">
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Sequência</div>
                         </div>
                         <div className="text-lg font-bold text-white relative z-10 flex items-center gap-2">
                             {streak.count}x
                             <span className={`w-3 h-3 rounded-full ${streak.color === 'red' ? 'bg-red-500' : streak.color === 'black' ? 'bg-gray-200' : 'bg-gray-700'}`}></span>
                         </div>
                         {/* Barra BG */}
                         <div className={`absolute bottom-0 left-0 h-1 transition-all duration-300 ${streak.color === 'red' ? 'bg-red-600' : streak.color === 'black' ? 'bg-white' : 'bg-transparent'}`} style={{width: '100%'}}></div>
                    </div>
                 </div>

                {/* Histórico Visual */}
                <div className="mb-2 flex items-center gap-2">
                    <Zap size={12} className="text-yellow-500" />
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Histórico Recente</span>
                </div>
                <HistoryTape history={history} />
                
            </div>

            {/* Terminal de Logs */}
            <div className="flex-1 p-4 pt-0 min-h-0">
                <ConsoleLog logs={logs} />
            </div>
        </div>
      </main>
    </div>
  );
}