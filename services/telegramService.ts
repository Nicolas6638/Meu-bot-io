import { BotConfig } from '../types';

const sendRequest = async (token: string, method: string, body: any) => {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        return data.ok ? data.result : null;
    } catch (error) {
        console.error(`Erro Telegram (${method}):`, error);
        return null;
    }
};

export const sendTelegramMessage = async (
  config: BotConfig,
  text: string,
  withButton: boolean = false
): Promise<number | null> => {
  if (!config.telegramToken || !config.chatId) return null;

  const body: any = {
      chat_id: config.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
  };

  if (withButton) {
      body.reply_markup = {
          inline_keyboard: [[
              { text: "🎰 Aposte Aqui", url: "https://blaze.bet.br/pt/games/double" }
          ]]
      };
  }

  const result = await sendRequest(config.telegramToken, 'sendMessage', body);
  return result ? result.message_id : null;
};

export const deleteTelegramMessage = async (
    config: BotConfig,
    messageId: number
): Promise<boolean> => {
    if (!config.telegramToken || !config.chatId || !messageId) return false;
    const result = await sendRequest(config.telegramToken, 'deleteMessage', {
        chat_id: config.chatId,
        message_id: messageId
    });
    return !!result;
};

export const sendTelegramSticker = async (
    config: BotConfig,
    stickerId?: string
): Promise<boolean> => {
    if (!config.telegramToken || !config.chatId || !stickerId) return false;

    const result = await sendRequest(config.telegramToken, 'sendSticker', {
        chat_id: config.chatId,
        sticker: stickerId
    });
    return !!result;
};

export const formatSignalMessage = (color: string, protection: number) => {
  const emoji = color === 'red' ? '🔴' : '⚫';
  const colorName = color === 'red' ? 'VERMELHO' : 'PRETO';
  
  return `
🚧 <b>SINAL ENCONTRADO</b> 🚧

<b>ENTRAR NA COR</b> ${emoji} ${colorName}
♻️ <b>Até Gale ${protection}</b>
`;
};

export const formatGaleMessage = (rollValue: number, rollColor: string, galeStep: number) => {
    return `
🎲 <b>Blaze Girou...</b>

⏱️ Saiu >> <b>| ${rollValue} | : ${rollColor === 'white' ? '⚪' : rollColor === 'red' ? '🔴' : '⚫'} |</b>

➡️ <b>Vamos para Gale ${galeStep}</b>
`;
};

export const formatWinMessage = (galeLevel: number) => {
  return `✅ <b>GREEN / VITÓRIA</b> ${galeLevel > 0 ? `(No Gale ${galeLevel})` : '(De Primeira)'} 🤑`;
};

export const formatLossMessage = () => {
  return `❌ <b>LOSS / RED</b>\nMantenha o gerenciamento.`;
};

export const formatStatsMessage = (stats: any) => {
    const accuracy = stats.totalSignals > 0 ? (stats.wins / stats.totalSignals * 100).toFixed(2) : '0.00';
    return `
<b> Placar: ✅ ${stats.wins} X ${stats.losses} ❌

- 🥇 Sem Gale: ${stats.winsNormal}
- 🐔 Com Gale: ${stats.winsGale}

✅ Wins seguidos: ${stats.consecutiveWins}
🎯 Assertividade: ${accuracy}% </b>
`;
};