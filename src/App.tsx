import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout } from './services/auth';
import { Navbar, ActiveTab } from './components/Navbar';
import { DriveOrganizer } from './components/DriveOrganizer';
import { SheetsCatalogExport } from './components/SheetsCatalogExport';
import { DocumentExtractor } from './components/DocumentExtractor';
import { GmailReviewBot } from './components/GmailReviewBot';
import { MonthlyReportPlanner } from './components/MonthlyReportPlanner';
import { ConfirmationModal } from './components/ConfirmationModal';
import { DriveFile, ConfirmationModalState } from './types';
import {
  FolderKanban,
  FileSpreadsheet,
  FileSearch,
  MailCheck,
  CalendarCheck2,
  Lock,
} from 'lucide-react';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('drive');
  const [documentToAnalyze, setDocumentToAnalyze] = useState<DriveFile | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authenticatedUser) => {
        setUser(authenticatedUser);
      },
      () => {
        setUser(null);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
      }
    } catch (err: any) {
      console.error('Sign-in failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
  };

  const handleAnalyzeDocumentFromDrive = (file: DriveFile) => {
    setDocumentToAnalyze(file);
    setActiveTab('extractor');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans text-slate-800 antialiased">
      {/* Navigation Header */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogin={handleSignIn}
        onLogout={handleSignOut}
        isLoggingIn={isLoggingIn}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!user ? (
          /* Welcome & Google Sign-In Card */
          <div className="max-w-xl mx-auto mt-12 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center space-y-6">
            <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <Lock className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Connect your Google Workspace
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
                Sign in with Google to access your Drive files with drag-and-drop organization, generate automated Google Sheets catalogs, analyze documents with Gemini AI, review Gmail threads safely, and track monthly productivity plans.
              </p>
            </div>

            {/* Feature highlights grid */}
            <div className="grid grid-cols-2 gap-3 text-left py-2">
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <FolderKanban className="w-4 h-4 text-indigo-600" />
                  <span>Drive Drag-and-Drop</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Organize files into folders and drop local files to upload.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Sheets Catalog</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Export complete file manifests with AI quick-look descriptions.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <MailCheck className="w-4 h-4 text-sky-600" />
                  <span>Gmail Pre-Archival Review</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Re-read threads with AI safety checks & dedicated chatbot.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <CalendarCheck2 className="w-4 h-4 text-amber-600" />
                  <span>Monthly Plan & Report</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Compare planned vs fulfilled tasks with Gemini evaluation.
                </p>
              </div>
            </div>

            <button
              id="hero-sign-in-btn"
              onClick={handleSignIn}
              disabled={isLoggingIn}
              className="w-full inline-flex items-center justify-center gap-3 px-6 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs hover:shadow-sm"
            >
              <div className="w-5 h-5">
                <svg viewBox="0 0 48 48" className="w-5 h-5">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              </div>
              <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google Workspace'}</span>
            </button>
          </div>
        ) : (
          /* Authenticated Dashboard Tabs */
          <div className="space-y-6">
            {activeTab === 'drive' && (
              <DriveOrganizer
                onAnalyzeDocument={handleAnalyzeDocumentFromDrive}
                onRequestConfirmation={(cfg) => setConfirmationModal(cfg)}
              />
            )}
            {activeTab === 'sheets' && <SheetsCatalogExport />}
            {activeTab === 'extractor' && (
              <DocumentExtractor
                initialFile={documentToAnalyze}
                onRequestConfirmation={(cfg) => setConfirmationModal(cfg)}
              />
            )}
            {activeTab === 'gmail' && (
              <GmailReviewBot onRequestConfirmation={(cfg) => setConfirmationModal(cfg)} />
            )}
            {activeTab === 'monthly' && (
              <MonthlyReportPlanner onRequestConfirmation={(cfg) => setConfirmationModal(cfg)} />
            )}
          </div>
        )}
      </main>

      {/* Confirmation Modal for Workspace operations */}
      <ConfirmationModal
        config={confirmationModal}
        onClose={() => setConfirmationModal(null)}
      />
    </div>
  );
}

export default App;
