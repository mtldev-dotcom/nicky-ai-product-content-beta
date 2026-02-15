import React from 'react';
import { ListTodo, ArrowRight, Circle, CheckCircle2 } from 'lucide-react';

export function ActiveProtocols() {
  const tasks = [
    { id: 1, title: 'Define PRD for Project Cortex', status: 'done' },
    { id: 2, title: 'Initialize /brain route', status: 'in-progress' },
    { id: 3, title: 'Connect Task Database', status: 'todo' },
  ];

  return (
    <div className="h-full flex flex-col glass rounded-2xl border border-white/10">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-indigo-400" />
          Active Protocols
        </h3>
        <span className="text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-1 rounded">
          {tasks.filter(t => t.status === 'in-progress').length} RUNNING
        </span>
      </div>

      <div className="flex-1 p-4 space-y-2">
        {tasks.map((task) => (
          <div 
            key={task.id} 
            className={`
              group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer
              ${task.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/20 opacity-60' : 
                task.status === 'in-progress' ? 'bg-indigo-500/10 border-indigo-500/30' : 
                'bg-white/5 border-white/5 hover:border-white/10'}
            `}
          >
            {task.status === 'done' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : task.status === 'in-progress' ? (
              <div className="w-4 h-4 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              </div>
            ) : (
              <Circle className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
            )}
            
            <span className={`text-sm ${task.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {task.title}
            </span>

            {task.status === 'in-progress' && (
              <div className="ml-auto text-[10px] text-indigo-400 font-mono tracking-wider flex items-center gap-1">
                EXECUTING <ArrowRight className="w-3 h-3" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
