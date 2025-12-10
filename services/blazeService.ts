import { BlazeRoll, BlazeColor } from '../types';

/**
 * SERVIÇO DE CONEXÃO VIA HTTP (POLLING)
 * Baseado no script Python 'BlazeBot' usando requests/aiohttp
 */

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected_http' | 'error';
type GameStatus = 'waiting' | 'rolling' | 'complete' | 'unknown';

interface BlazeAPIResponse {
  id: string;
  status: GameStatus;
  color: number;
  roll: number;
  created_at: string;
  server_seed: string;
}

// Mapeamento idêntico ao Python
const COLOR_MAP: Record<number, BlazeColor> = {
  0: 'white',
  1: 'red',
  2: 'black'
};

const BASE_URL = "https://api.blaze.bet.br";

class BlazeService {
  private listeners: Array<(data: { status: GameStatus, roll: BlazeRoll }) => void> = [];
  private statusListeners: Array<(status: ConnectionStatus) => void> = [];
  private intervalId: number | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  
  private lastGameId: string | null = null;
  private lastGameStatus: GameStatus | null = null;

  // URL do script Python
  private currentUrl = `${BASE_URL}/api/singleplayer-originals/originals/roulette_games/current/1`;
  private recentUrl = `${BASE_URL}/api/singleplayer-originals/originals/roulette_games/recent/1`;

  // --- Gerenciamento de Listeners ---
  subscribe(callback: (data: { status: GameStatus, roll: BlazeRoll }) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  setStatusListener(callback: (status: ConnectionStatus) => void) {
    this.statusListeners.push(callback);
  }

  private updateConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  private notify(status: GameStatus, roll: BlazeRoll) {
    this.listeners.forEach(cb => cb({ status, roll }));
  }

  // --- API Methods (Fetch equivalente ao aiohttp) ---
  
  public async getRecentHistory(): Promise<BlazeRoll[]> {
    try {
        const response = await fetch(this.recentUrl);
        if (!response.ok) throw new Error('Falha ao buscar histórico');
        
        const data = await response.json();
        
        // Mapeia estrutura da API para estrutura interna
        return data.map((item: any) => ({
            id: item.id,
            color: COLOR_MAP[item.color],
            number: item.roll,
            timestamp: item.created_at
        }));
    } catch (error) {
        console.error("Erro ao buscar histórico:", error);
        return [];
    }
  }

  private async fetchCurrent(): Promise<BlazeAPIResponse | null> {
    try {
        const response = await fetch(this.currentUrl);
        if (!response.ok) {
            // Se der erro 403/Cors, tentamos api.blaze.com como fallback
            if (this.currentUrl.includes('bet.br')) {
                this.currentUrl = this.currentUrl.replace('bet.br', 'com');
                this.recentUrl = this.recentUrl.replace('bet.br', 'com');
            }
            return null;
        }
        return await response.json();
    } catch (error) {
        return null;
    }
  }

  // --- Loop Principal (Main Loop do Python) ---

  public connect() {
    if (this.intervalId) return;
    
    this.updateConnectionStatus('connecting');
    console.log("🔄 Iniciando HTTP Polling...");

    // Loop de 1 segundo (asyncio.sleep(1) do Python)
    this.intervalId = window.setInterval(async () => {
        const data = await this.fetchCurrent();

        if (!data) {
            // Falha na requisição
            if (this.connectionStatus !== 'error') this.updateConnectionStatus('error');
            return;
        }

        if (this.connectionStatus !== 'connected_http') {
            this.updateConnectionStatus('connected_http');
        }

        const currentStatus = data.status;
        const currentId = data.id;

        // Converte para objeto interno
        const roll: BlazeRoll = {
            id: data.id,
            color: COLOR_MAP[data.color],
            number: data.roll,
            timestamp: data.created_at
        };

        // Detecta mudança de estado ou novo ID
        // O Python verifica: status, recent_roll, color_recente a cada loop
        
        // Se mudou o status ou mudou o ID (novo jogo), notificamos
        if (currentStatus !== this.lastGameStatus || currentId !== this.lastGameId) {
            this.lastGameStatus = currentStatus;
            this.lastGameId = currentId;
            
            this.notify(currentStatus, roll);
        }

    }, 1000); // 1000ms = 1 segundo
  }

  public disconnect() {
    if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }
    this.updateConnectionStatus('disconnected');
  }
}

export const blazeService = new BlazeService();