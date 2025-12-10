import { BlazeRoll, StrategyResult, Pattern, BlazeColor } from '../types';

/**
 * MÓDULO DE ESTRATÉGIA - PORT DO PYTHON
 * Lógica: verificar_padrao(sequenciaPadrao, previsaoPadrao)
 */

// Padrões hardcoded (Simulando o sequencias.json)
// Formato do Python: [Padrão, Previsão]
const PYTHON_PATTERNS: Array<[Array<string|number>, string]> = [
  // Exemplo: 3 Vermelhos -> Entra Preto (V, V, V -> P)
  [['V', 'V', 'V'], 'P'],
  // Exemplo: 3 Pretos -> Entra Vermelho (P, P, P -> V)
  [['P', 'P', 'P'], 'V'],
  // Exemplo: Alternado V P V -> Entra P
  [['V', 'P', 'V'], 'P'],
  // Exemplo: Alternado P V P -> Entra V
  [['P', 'V', 'P'], 'V'],
  // Exemplo com Coringa (X) e Número: [Qualquer, 0, Qualquer] -> Vermelho
  [['X', 0, 'X'], 'V'] 
];

// Helper para converter a cor da Blaze para a letra usada no Python
const mapColorToLetter = (color: BlazeColor): string => {
  if (color === 'white') return 'B';
  if (color === 'red') return 'V';
  if (color === 'black') return 'P';
  return '?';
};

/**
 * Função portada do Python: verificar_padrao
 */
export const checkPythonPatterns = (history: BlazeRoll[]): StrategyResult => {
  // history[0] é o mais recente. O Python inverte a lista para comparar.
  // Vamos trabalhar com history[0] sendo o mais recente.
  
  if (!history || history.length === 0) return { enter: false };

  for (const [patternSeq, prediction] of PYTHON_PATTERNS) {
      // Verifica tamanho
      if (patternSeq.length > history.length) continue;

      // Pega o segmento do histórico correspondente ao tamanho do padrão
      // history[0] = ultimo. history[1] = penultimo.
      // Se padrão tem tam 3 (ex: V, V, V), precisamos verificar history[2], history[1], history[0]
      // No Python: last_segment = last_results[-len(sequenciaPadrao):]
      
      let match = true;
      
      for (let i = 0; i < patternSeq.length; i++) {
          // O índice no pattern é sequencial (0, 1, 2)
          // O índice no histórico é reverso relativo ao tamanho (tamanho-1 .. 0)
          // Ex: Padrão [V, V, V]. i=0 (antigo), i=1 (meio), i=2 (recente)
          // Histórico: history[2] (antigo), history[1] (meio), history[0] (recente)
          const historyIndex = (patternSeq.length - 1) - i;
          
          const roll = history[historyIndex];
          const patternItem = patternSeq[i]; // Pode ser string ("V") ou numero (11)

          // Lógica do Python:
          if (typeof patternItem === 'number' || (typeof patternItem === 'string' && !isNaN(Number(patternItem)))) {
              // Comparação numérica
              if (roll.number !== Number(patternItem)) {
                  match = false;
                  break;
              }
          } else {
              // Comparação de Cor / String
              const patternLetter = String(patternItem).toUpperCase();
              const outcomeLetter = mapColorToLetter(roll.color); // V, P, B

              if (patternLetter === 'X') {
                  continue; // Coringa
              } else if (patternLetter === 'N') {
                  // N = Não Branco (V ou P)
                  if (outcomeLetter !== 'V' && outcomeLetter !== 'P') {
                      match = false;
                      break;
                  }
              } else {
                  // Comparação direta (V == V, P == P, B == B)
                  if (outcomeLetter !== patternLetter) {
                      match = false;
                      break;
                  }
              }
          }
      }

      if (match) {
          // Converte a previsão (Letra) para BlazeColor
          let target: BlazeColor | undefined;
          if (prediction === 'V') target = 'red';
          else if (prediction === 'P') target = 'black';
          else if (prediction === 'B') target = 'white';

          if (target) {
              return {
                  enter: true,
                  targetColor: target,
                  patternName: patternSeq.join('-')
              };
          }
      }
  }

  return { enter: false };
};

export const getCurrentStreak = (history: BlazeRoll[]) => {
    if (history.length === 0) return { color: 'none', count: 0 };
    const firstColor = history[0].color;
    let count = 0;
    for (const roll of history) {
        if (roll.color === firstColor) count++;
        else break;
    }
    return { color: firstColor, count };
};