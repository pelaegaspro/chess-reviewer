import React from 'react';
import { User } from '../types';
import { 
  LayoutDashboard, Compass, AlertTriangle, Bookmark, 
  DownloadCloud, FileText, Sparkles, User as UserIcon, LogOut 
} from 'lucide-react';

export type NavTab = 'dashboard' | 'connect' | 'pgn' | 'insights' | 'review' | 'helper' | 'mistakes' | 'saved';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  user,
  onOpenAuth,
  onLogout
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E8E6E1] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between py-3">
        {/* Brand Logo */}
        <div 
          onClick={() => onSelectTab('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer group select-none"
        >
          <div className="w-9 h-9 rounded-xl bg-[#6CFF93] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform border border-[#5FE683]">
            <span className="font-extrabold text-base text-[#1A1919] font-sans">♞</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-black text-xl text-[#1A1919] tracking-tight font-sans">
              Aether<span className="text-[#0A8A36]">Chess</span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1.5 bg-[#F5F4F2] p-1.5 rounded-full border border-[#E8E6E1]/80">
          {/* PRIMARY 1: Game Review */}
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              currentTab === 'dashboard' || currentTab === 'review'
                ? 'bg-[#1A1919] text-[#6CFF93] shadow-sm'
                : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Game Review</span>
          </button>

          {/* PRIMARY 2: Chess Helper */}
          <button
            onClick={() => onSelectTab('helper')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              currentTab === 'helper'
                ? 'bg-[#1A1919] text-[#6CFF93] shadow-sm'
                : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#0A8A36]" />
            <span>Chess Helper</span>
          </button>

          {/* DIFFERENTIATION: My Mistakes */}
          <button
            onClick={() => onSelectTab('mistakes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              currentTab === 'mistakes'
                ? 'bg-[#1A1919] text-[#6CFF93] shadow-sm'
                : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>My Mistakes</span>
          </button>

          {/* DIFFERENTIATION: Saved Positions */}
          <button
            onClick={() => onSelectTab('saved')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              currentTab === 'saved'
                ? 'bg-[#1A1919] text-[#6CFF93] shadow-sm'
                : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/60'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
            <span>Saved Positions</span>
          </button>
        </nav>

        {/* User Account Controls */}
        <div className="flex items-center gap-2.5">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F4F2] border border-[#E8E6E1]">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-6 h-6 rounded-full object-cover border border-[#E8E6E1]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#6CFF93] text-[#1A1919] flex items-center justify-center text-xs font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-left">
                  {user.title && (
                    <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#BF2A2A] text-white rounded leading-none shadow-xs">
                      {user.title}
                    </span>
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#1A1919] max-w-[120px] truncate leading-tight">
                      {user.username}
                    </span>
                    {user.email && (
                      <span className="text-[10px] text-[#71706E] max-w-[120px] truncate leading-tight">
                        {user.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Log out"
                aria-label="Log out of account"
                className="btn-ghost"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              aria-label="Log in to account"
              className="btn-secondary"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Log in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
