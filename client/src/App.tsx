import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { User } from './types';
import { Navbar, NavTab } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { ConnectPage } from './pages/ConnectPage';
import { ImportPgnPage } from './pages/ImportPgnPage';
import { InsightsPage } from './pages/InsightsPage';
import { ReviewPage } from './pages/ReviewPage';
import { ChessHelperPage } from './pages/ChessHelperPage';
import { MistakesPage } from './pages/MistakesPage';
import { SavedPositionsPage } from './pages/SavedPositionsPage';
import { AuthModal } from './pages/AuthModal';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/chess-helper')) return 'helper';
    if (path === '/mistakes') return 'mistakes';
    if (path === '/saved') return 'saved';
    return 'dashboard';
  });
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [helperInitialFen, setHelperInitialFen] = useState<string | undefined>(undefined);

  // Check URL path on mount & popstate
  useEffect(() => {
    const handleUrlRouting = async () => {
      const path = window.location.pathname;
      if (path.startsWith('/chess-helper/position/')) {
        const posId = path.split('/chess-helper/position/')[1];
        if (posId) {
          try {
            const shared = await api.getPublicSharedPosition(posId);
            if (shared?.fen) {
              setHelperInitialFen(shared.fen);
            }
          } catch (err) {
            console.warn('Failed to load shared position:', err);
          }
        }
        setCurrentTab('helper');
      } else if (path.startsWith('/chess-helper')) {
        setCurrentTab('helper');
      } else if (path === '/mistakes') {
        setCurrentTab('mistakes');
      } else if (path === '/saved') {
        setCurrentTab('saved');
      } else {
        setCurrentTab('dashboard');
      }
    };

    handleUrlRouting();
    window.addEventListener('popstate', handleUrlRouting);
    return () => window.removeEventListener('popstate', handleUrlRouting);
  }, []);

  // Check current session or require login with Google or Chess.com
  useEffect(() => {
    const initAuth = async () => {
      const currentUser = await api.getMe();
      if (currentUser) {
        setUser(currentUser);
      } else {
        // Open auth modal requiring Google or Chess.com login
        setAuthModalOpen(true);
      }
    };

    initAuth();
  }, []);

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setSelectedGameId(null);
    setCurrentTab('dashboard');
    window.history.pushState(null, '', '/');
  };

  const handleSelectGame = (gameId: string) => {
    setSelectedGameId(gameId);
    setCurrentTab('review');
    window.history.pushState(null, '', '/');
  };

  const handleTabChange = (tab: NavTab) => {
    setCurrentTab(tab);
    if (tab === 'helper') {
      window.history.pushState(null, '', '/chess-helper');
    } else if (tab === 'mistakes') {
      window.history.pushState(null, '', '/mistakes');
    } else if (tab === 'saved') {
      window.history.pushState(null, '', '/saved');
    } else {
      if (tab !== 'review') setSelectedGameId(null);
      window.history.pushState(null, '', '/');
    }
  };

  const handleOpenInChessHelper = (fen: string) => {
    setHelperInitialFen(fen);
    setCurrentTab('helper');
    window.history.pushState(null, '', '/chess-helper');
  };

  return (
    <div className={`min-h-screen ${currentTab === 'review' ? 'bg-[#161512] text-white' : 'bg-[#F5F4F2] text-[#1A1919]'} flex flex-col selection:bg-[#6CFF93]/40`}>
      <Navbar
        currentTab={currentTab}
        onSelectTab={handleTabChange}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {currentTab === 'dashboard' && (
          <DashboardPage
            onSelectGame={handleSelectGame}
            onNavigateConnect={() => handleTabChange('connect')}
            onNavigatePgn={() => handleTabChange('pgn')}
          />
        )}

        {currentTab === 'connect' && (
          <ConnectPage
            onImportComplete={() => handleTabChange('dashboard')}
          />
        )}

        {currentTab === 'pgn' && (
          <ImportPgnPage
            onImportSuccess={gameId => handleSelectGame(gameId)}
          />
        )}

        {currentTab === 'insights' && (
          <InsightsPage
            onSelectGame={handleSelectGame}
            onNavigateConnect={() => handleTabChange('connect')}
          />
        )}

        {currentTab === 'review' && selectedGameId && (
          <ReviewPage
            gameId={selectedGameId}
            currentUser={user}
            onBack={() => {
              setSelectedGameId(null);
              handleTabChange('dashboard');
            }}
            onOpenInChessHelper={handleOpenInChessHelper}
          />
        )}

        {currentTab === 'helper' && (
          <ChessHelperPage
            initialFen={helperInitialFen}
            onNavigateGameReview={() => handleTabChange('dashboard')}
          />
        )}

        {currentTab === 'mistakes' && (
          <MistakesPage
            onOpenInChessHelper={handleOpenInChessHelper}
            onSelectGameReview={handleSelectGame}
          />
        )}

        {currentTab === 'saved' && (
          <SavedPositionsPage
            onOpenInChessHelper={handleOpenInChessHelper}
          />
        )}
      </main>

      {/* Footer */}
      {currentTab !== 'review' && (
        <footer className="border-t border-[#E8E6E1] bg-white py-6 text-center text-xs text-[#71706E] font-sans">
          <p>ChessLens • Powered by Stockfish 18 NNUE Engine & Cat Coach Game Review</p>
        </footer>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={newUser => setUser(newUser)}
      />
    </div>
  );
};

export default App;
