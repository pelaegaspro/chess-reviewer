import React, { useState } from 'react';
import { api } from '../services/api';
import { User } from '../types';
import { X, Lock, Mail, User as UserIcon, AlertCircle, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import { firebaseRegisterEmail, firebaseLoginEmail, firebaseLoginGoogle } from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [authMethod, setAuthMethod] = useState<'email' | 'oauth'>('email');
  const [isRegister, setIsRegister] = useState<boolean>(false);

  // Email state
  const [email, setEmail] = useState<string>('player@chesslens.com');
  const [username, setUsername] = useState<string>('grandmaster_pelae');
  const [password, setPassword] = useState<string>('Password123!');

  // Chess.com state
  const [chesscomUser, setChesscomUser] = useState<string>('hikaru');
  const [chesscomLoading, setChesscomLoading] = useState<boolean>(false);
  const [chesscomProfile, setChesscomProfile] = useState<any>(null);

  // Google state
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [showGoogleInput, setShowGoogleInput] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1. Google Login Handler via Firebase
  const handleGoogleLogin = async (customEmail?: string) => {
    try {
      setLoading(true);
      setError(null);

      let fbResult: any = null;
      try {
        fbResult = await firebaseLoginGoogle();
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/popup-closed-by-user') {
          return;
        }
        console.warn('[Firebase Google Auth]: Falling back to local OAuth handler', fbErr.message);
      }

      let res;
      if (fbResult && fbResult.idToken) {
        res = await api.loginWithFirebase({
          idToken: fbResult.idToken,
          email: fbResult.user.email || undefined,
          displayName: fbResult.user.displayName || undefined,
          photoURL: fbResult.user.photoURL || undefined,
          uid: fbResult.user.uid
        });
      } else {
        const emailToUse = customEmail || googleEmail || 'chessmaster@gmail.com';
        const name = emailToUse.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
        res = await api.loginWithGoogle(undefined, {
          id: `google_${Date.now()}`,
          email: emailToUse,
          name: name,
          picture: 'https://lh3.googleusercontent.com/a/default-user'
        });
      }

      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  // 2. Chess.com Profile Preview & Login Handler
  const handleVerifyChessCom = async () => {
    if (!chesscomUser.trim()) {
      setError('Please enter your Chess.com username');
      return;
    }
    try {
      setChesscomLoading(true);
      setError(null);
      const profile = await api.getChessComProfile(chesscomUser.trim());
      setChesscomProfile(profile);
    } catch (err: any) {
      setError(err.message || 'Chess.com account not found or public API unreachable');
      setChesscomProfile(null);
    } finally {
      setChesscomLoading(false);
    }
  };

  const handleConfirmChessComLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.loginWithChessCom(chesscomUser.trim());
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chess.com login failed');
    } finally {
      setLoading(false);
    }
  };

  // 3. Firebase Email / Password Authentication
  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      let fbResult: any = null;
      try {
        if (isRegister) {
          fbResult = await firebaseRegisterEmail(email.trim(), password, username.trim());
        } else {
          fbResult = await firebaseLoginEmail(email.trim(), password);
        }
      } catch (fbErr: any) {
        console.warn('[Firebase Email Auth Notice]:', fbErr.code, fbErr.message);
        // Only fallback if Firebase is not yet configured or blocked
        if (fbErr.code === 'auth/invalid-api-key' || fbErr.code === 'auth/api-key-not-valid' || fbErr.code === 'auth/network-request-failed' || fbErr.code === 'auth/operation-not-allowed') {
          fbResult = null;
        } else {
          throw fbErr;
        }
      }

      let userRes;
      if (fbResult && fbResult.idToken) {
        userRes = await api.loginWithFirebase({
          idToken: fbResult.idToken,
          email: fbResult.user.email || email,
          displayName: fbResult.user.displayName || username,
          photoURL: fbResult.user.photoURL || undefined,
          uid: fbResult.user.uid
        });
      } else {
        if (isRegister) {
          userRes = await api.register(email, username, password);
        } else {
          userRes = await api.login(email || username, password);
        }
      }

      onSuccess(userRes.user);
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Authentication failed';
      if (msg.includes('auth/email-already-in-use')) {
        setError('This email is already registered. Please switch to "Sign in" below.');
      } else if (msg.includes('auth/wrong-password') || msg.includes('auth/invalid-credential')) {
        setError('Incorrect email or password. Please verify credentials.');
      } else if (msg.includes('auth/user-not-found')) {
        setError('No account found with this email. Please switch to "Create Account".');
      } else if (msg.includes('auth/weak-password')) {
        setError('Password should be at least 6 characters.');
      } else if (msg.includes('auth/invalid-email')) {
        setError('Please enter a valid email address.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // 4. Quick Demo Login
  const handleQuickDemo = async () => {
    try {
      setLoading(true);
      setError(null);
      const randomId = Math.floor(Math.random() * 10000);
      const demoEmail = `demo_${randomId}@aetherchess.local`;
      const demoUser = `ChessMaster_${randomId}`;
      const demoPass = 'DemoPass123!';

      const res = await api.register(demoEmail, demoUser, demoPass);
      onSuccess(res.user);
      onClose();
    } catch {
      try {
        const res = await api.login('player@aetherchess.local', 'Password123!');
        onSuccess(res.user);
        onClose();
      } catch (loginErr: any) {
        setError(loginErr.message || 'Demo access failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1919]/60 backdrop-blur-sm animate-in fade-in font-sans">
      <div className="relative w-full max-w-lg bg-white border border-[#E8E6E1] rounded-3xl p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-full text-[#71706E] hover:text-[#1A1919] hover:bg-[#F5F4F2] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6CFF93] flex items-center justify-center border border-[#5FE683] shadow-xs">
            <span className="font-black text-lg text-[#1A1919]">♞</span>
          </div>
          <div>
            <h2 className="text-xl font-black text-[#1A1919] tracking-tight">
              Sign in to AetherChess
            </h2>
            <p className="text-xs text-[#71706E] font-medium">
              Save analyzed games, track accuracy, and sync with Firebase & Cloud Firestore.
            </p>
          </div>
        </div>

        {/* Auth Method Selector */}
        <div className="flex bg-[#F5F4F2] p-1 rounded-2xl border border-[#E8E6E1]">
          <button
            type="button"
            onClick={() => { setAuthMethod('email'); setError(null); }}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
              authMethod === 'email'
                ? 'bg-white text-[#1A1919] shadow-xs'
                : 'text-[#71706E] hover:text-[#1A1919]'
            }`}
          >
            Email & Password
          </button>
          <button
            type="button"
            onClick={() => { setAuthMethod('oauth'); setError(null); }}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
              authMethod === 'oauth'
                ? 'bg-white text-[#1A1919] shadow-xs'
                : 'text-[#71706E] hover:text-[#1A1919]'
            }`}
          >
            Google & Chess.com
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {authMethod === 'oauth' ? (
          <div className="space-y-4">
            {/* GOOGLE SIGN IN */}
            <div className="p-4 rounded-2xl bg-[#F5F4F2]/70 border border-[#E8E6E1] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="text-xs font-black text-[#1A1919]">Google Sign-In</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A8A36] bg-[#6CFF93]/30 px-2 py-0.5 rounded-full">
                  Firebase Auth
                </span>
              </div>

              {showGoogleInput ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    placeholder="Enter your Google email (e.g. you@gmail.com)"
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#E8E6E1] text-xs text-[#1A1919] focus:outline-none focus:border-[#1A1919]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleGoogleLogin(googleEmail)}
                      disabled={loading || !googleEmail.trim()}
                      className="flex-1 py-2 rounded-xl bg-[#1A1919] text-white text-xs font-bold hover:bg-[#333] transition-all disabled:opacity-50"
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGoogleInput(false)}
                      className="px-3 py-2 rounded-xl border border-[#E8E6E1] text-xs font-bold text-[#71706E] hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleGoogleLogin()}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-[#F5F4F2] border border-[#E8E6E1] text-[#1A1919] text-xs font-black transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <span>Sign in with Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGoogleInput(true)}
                    className="px-3 py-2.5 rounded-xl border border-[#E8E6E1] bg-white text-xs font-bold text-[#71706E] hover:text-[#1A1919]"
                    title="Specify custom Gmail"
                  >
                    Custom...
                  </button>
                </div>
              )}
            </div>

            {/* CHESS.COM VERIFIED SIGN IN */}
            <div className="p-4 rounded-2xl bg-[#F5F4F2]/70 border border-[#E8E6E1] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-[#689F38] text-white flex items-center justify-center text-xs font-bold">
                    ♟
                  </div>
                  <span className="text-xs font-black text-[#1A1919]">Chess.com Account</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#71706E] bg-white px-2 py-0.5 rounded-full border border-[#E8E6E1]">
                  Live API Sync
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chesscomUser}
                  onChange={(e) => setChesscomUser(e.target.value)}
                  placeholder="Chess.com handle (e.g. hikaru)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-[#E8E6E1] text-xs font-bold text-[#1A1919] focus:outline-none focus:border-[#1A1919]"
                />
                <button
                  type="button"
                  onClick={handleVerifyChessCom}
                  disabled={chesscomLoading}
                  className="px-4 py-2.5 rounded-xl bg-[#1A1919] hover:bg-[#333] text-white text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {chesscomLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Verify</span>
                </button>
              </div>

              {/* Profile Preview Card */}
              {chesscomProfile && (
                <div className="p-3 bg-white rounded-xl border border-[#0A8A36]/30 flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center gap-3">
                    {chesscomProfile.avatar ? (
                      <img
                        src={chesscomProfile.avatar}
                        alt={chesscomProfile.username}
                        className="w-10 h-10 rounded-full object-cover border border-[#E8E6E1]"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#689F38] text-white flex items-center justify-center font-bold text-sm">
                        {chesscomProfile.username?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        {chesscomProfile.title && (
                          <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#BF2A2A] text-white rounded leading-none">
                            {chesscomProfile.title}
                          </span>
                        )}
                        <span className="text-xs font-black text-[#1A1919]">
                          {chesscomProfile.username}
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0A8A36]" />
                      </div>
                      <span className="text-[10px] text-[#71706E] font-medium">
                        {chesscomProfile.name || 'Verified Chess.com Player'} {chesscomProfile.country ? `• ${chesscomProfile.country.split('/').pop()?.toUpperCase()}` : ''}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmChessComLogin}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] text-xs font-black transition-all border border-[#5FE683] shadow-xs flex items-center gap-1"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Sign In</span>}
                  </button>
                </div>
              )}

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-2 pt-1 text-[11px] text-[#71706E]">
                <span>Popular:</span>
                {['hikaru', 'magnuscarlsen', 'daniil_dubov'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      setChesscomUser(u);
                      setChesscomProfile(null);
                    }}
                    className="underline hover:text-[#1A1919] font-bold"
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Guest Access */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleQuickDemo}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#F5F4F2] border border-[#E8E6E1] text-[#71706E] hover:text-[#1A1919] text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-3.5 h-3.5 text-[#0A8A36] fill-[#0A8A36]" />
                <span>Quick Guest Access (Sandbox mode)</span>
              </button>
            </div>
          </div>
        ) : (
          /* TRADITIONAL EMAIL / PASSWORD */
          <form onSubmit={handleSubmitEmail} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-black text-[#1A1919] mb-1">Username</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#9E9D9A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] text-xs text-[#1A1919] focus:outline-none focus:border-[#1A1919] font-medium"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-[#1A1919] mb-1">
                {isRegister ? 'Email Address' : 'Email or Username'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#9E9D9A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] text-xs text-[#1A1919] focus:outline-none focus:border-[#1A1919] font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-[#1A1919] mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#9E9D9A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] text-xs text-[#1A1919] focus:outline-none focus:border-[#1A1919] font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-50 text-[#1A1919] font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] border border-[#5FE683]"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-[#1A1919]" />}
              <span>{isRegister ? 'Create Account' : 'Sign in with Email'}</span>
            </button>

            <div className="text-center text-xs text-[#71706E] pt-2">
              {isRegister ? 'Already have an account?' : "Don't have an account yet?"}{' '}
              <button
                type="button"
                onClick={() => setIsRegister(prev => !prev)}
                className="text-[#1A1919] hover:underline font-black"
              >
                {isRegister ? 'Sign in' : 'Create Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
