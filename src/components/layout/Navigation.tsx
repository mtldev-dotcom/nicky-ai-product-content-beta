'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Languages, 
  Image as ImageIcon, 
  Layers, 
  Settings,
  Database,
  LogOut,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/login/actions';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dash', href: '/' },
  { icon: Languages, label: 'Details', href: '/product-details' },
  { icon: ImageIcon, label: 'Media', href: '/media' },
  { icon: Layers, label: 'Variants', href: '/variants' },
  { icon: Database, label: 'JSON', href: '/json' },
  { icon: BarChart3, label: 'Usage', href: '/usage' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export const Navigation = () => {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 h-full w-20 flex-col items-center py-8 glass-dark border-r border-white/10 z-50">
        <div className="mb-12">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="text-white w-6 h-6" />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col gap-8">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "p-3 rounded-xl transition-all duration-300 group relative",
                  isActive 
                    ? "bg-indigo-500/10 text-indigo-400" 
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                )}
              >
                <item.icon className="w-6 h-6" />
                <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5 z-[60]">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto">
          <button 
            onClick={() => signOut()}
            className="p-3 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group relative"
          >
            <LogOut className="w-6 h-6" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5 z-[60]">
              Sign Out
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full glass-dark border-t border-white/10 px-4 py-3 flex justify-between items-center z-50 pb-safe">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 transition-all duration-300",
                isActive ? "text-indigo-400" : "text-zinc-500"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "scale-110")} />
              <span className="text-[10px] font-medium uppercase tracking-tighter">
                {item.label}
              </span>
            </Link>
          );
        })}
        <button 
          onClick={() => signOut()}
          className="flex flex-col items-center gap-1 text-zinc-500 hover:text-red-400 transition-all duration-300"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-tighter">
            Exit
          </span>
        </button>
      </nav>
    </>
  );
};

