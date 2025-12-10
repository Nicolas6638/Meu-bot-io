import React from 'react';
import { BlazeRoll } from '../types';

interface HistoryTapeProps {
  history: BlazeRoll[];
}

export const HistoryTape: React.FC<HistoryTapeProps> = ({ history }) => {
  return (
    <div className="w-full bg-gray-800 p-4 rounded-lg shadow-inner mb-6 overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-800 to-transparent z-10 pointer-events-none"></div>
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-800 to-transparent z-10 pointer-events-none"></div>
      
      <div className="flex items-center justify-start gap-2 overflow-x-auto scrollbar-hide">
        {history.map((roll, index) => {
            let bgClass = 'bg-gray-700';
            let textClass = 'text-white';
            let borderClass = 'border-gray-600';

            if (roll.color === 'red') {
                bgClass = 'bg-red-600';
                borderClass = 'border-red-400';
            } else if (roll.color === 'black') {
                bgClass = 'bg-gray-900';
                borderClass = 'border-gray-600';
            } else if (roll.color === 'white') {
                bgClass = 'bg-white';
                textClass = 'text-gray-900';
                borderClass = 'border-gray-300';
            }

            return (
                <div 
                    key={roll.id} 
                    className={`
                        history-slide flex-shrink-0 w-12 h-12 rounded-lg 
                        flex items-center justify-center font-bold text-lg border-2 shadow-lg
                        ${bgClass} ${textClass} ${borderClass}
                        ${index === 0 ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-800 scale-110' : 'opacity-80'}
                    `}
                >
                    {roll.color === 'white' ? 'B' : roll.number}
                </div>
            );
        })}
        {history.length === 0 && (
            <div className="text-gray-500 w-full text-center py-2">
                Aguardando giros...
            </div>
        )}
      </div>
      <div className="text-center text-xs text-gray-400 mt-2">
        ◀ Mais Recente
      </div>
    </div>
  );
};