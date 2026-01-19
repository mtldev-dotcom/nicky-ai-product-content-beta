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
  Eye,
  LogOut,
  BarChart3,
  Sparkles,
  UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/login/actions';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dash', href: '/' },
  { icon: Sparkles, label: 'Create', href: '/create' },
  { icon: Languages, label: 'Details', href: '/product-details' },
  { icon: Eye, label: 'Preview', href: '/preview' },
  { icon: ImageIcon, label: 'Media', href: '/media' },
  { icon: UserCircle, label: 'Assets', href: '/studio-assets' },
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
      <nav className="hidden md:flex fixed left-0 top-0 h-full w-20 flex-col items-center py-6 glass-dark border-r border-white/10 z-50 overflow-y-auto">
        <div className="mb-8 flex-shrink-0">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="text-white w-6 h-6" />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col gap-2 w-full px-2 min-h-0 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href === '/create' && pathname?.startsWith('/create'));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "p-3 rounded-xl transition-all duration-300 group relative flex items-center justify-center w-full",
                  isActive 
                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" 
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "scale-110")} />
                <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5 z-[60] shadow-lg">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-4 flex-shrink-0 w-full px-2">
          <button 
            onClick={() => signOut()}
            className="p-3 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group relative w-full flex items-center justify-center"
          >
            <LogOut className="w-5 h-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5 z-[60] shadow-lg">
              Sign Out
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full glass-dark border-t border-white/10 px-1 py-2 flex justify-between items-center z-50 pb-safe overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href === '/create' && pathname?.startsWith('/create'));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 transition-all duration-300 flex-shrink-0 px-2 py-1.5 touch-target rounded-lg",
                isActive 
                  ? "text-indigo-400 bg-indigo-500/10" 
                  : "text-zinc-500 active:bg-white/5"
              )}
            >
              <item.icon className={cn("w-6 h-6", isActive && "scale-110")} />
              <span className="text-[9px] font-medium uppercase tracking-tighter leading-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
        <button 
          onClick={() => signOut()}
          className="flex flex-col items-center gap-1 text-zinc-500 hover:text-red-400 transition-all duration-300 touch-target px-2 py-1.5 rounded-lg active:bg-red-500/10"
        >
          <LogOut className="w-6 h-6" />
          <span className="text-[9px] font-medium uppercase tracking-tighter leading-tight">
            Exit
          </span>
        </button>
      </nav>
    </>
  );
};

