import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface ConsoleLogProps {
  logs: LogEntry[];
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-black rounded-lg border border-gray-700 font-mono text-sm shadow-2xl">
      <div className="bg-gray-800 px-4 py-2 text-gray-300 text-xs uppercase tracking-wider border-b border-gray-700 flex justify-between items-center">
        <span>Terminal de Logs</span>
        <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-1">
        {logs.length === 0 && (
            <div className="text-gray-600 italic">Nenhuma atividade registrada...</div>
        )}
        {logs.map((log) => {
            let color = 'text-gray-300';
            if (log.type === 'error') color = 'text-red-400';
            if (log.type === 'success') color = 'text-green-400';
            if (log.type === 'signal') color = 'text-yellow-400 font-bold';
            if (log.type === 'win') color = 'text-green-500 font-bold bg-green-900/20 px-2 rounded inline-block';
            if (log.type === 'loss') color = 'text-red-500 font-bold bg-red-900/20 px-2 rounded inline-block';

            return (
                <div key={log.id} className="border-l-2 border-transparent hover:border-gray-600 pl-2">
                    <span className="text-gray-500 mr-2">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                    <span className={color}>{log.message}</span>
                    {log.detail && <div className="text-gray-500 text-xs ml-20">{log.detail}</div>}
                </div>
            );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};