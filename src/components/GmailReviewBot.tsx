import React, { useState, useEffect } from 'react';
import {
  Mail,
  Archive,
  Bot,
  Send,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Search,
  MessageSquare,
  Clock,
  User as UserIcon,
} from 'lucide-react';
import { GmailThreadItem, GmailMessageItem, ConfirmationModalState } from '../types';
import { fetchInboxThreads, fetchFullThread, archiveGmailThread } from '../services/gmail';

interface GmailReviewBotProps {
  onRequestConfirmation: (config: ConfirmationModalState) => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export const GmailReviewBot: React.FC<GmailReviewBotProps> = ({ onRequestConfirmation }) => {
  const [threads, setThreads] = useState<GmailThreadItem[]>([]);
  const [selectedThread, setSelectedThread] = useState<GmailThreadItem | null>(null);
  const [threadMessages, setThreadMessages] = useState<GmailMessageItem[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [archiveSuccessMessage, setArchiveSuccessMessage] = useState<string>('');

  // AI Chat & Re-reading
  const [threadSummary, setThreadSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [isChatting, setIsChatting] = useState<boolean>(false);

  const loadInbox = async () => {
    setIsLoadingThreads(true);
    try {
      const fetched = await fetchInboxThreads(25);
      setThreads(fetched);
      if (!selectedThread && fetched.length > 0) {
        handleSelectThread(fetched[0]);
      }
    } catch (err: any) {
      console.error('Failed to load inbox threads:', err);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, []);

  const handleSelectThread = async (thread: GmailThreadItem) => {
    setSelectedThread(thread);
    setIsLoadingMessages(true);
    setThreadSummary('');
    setChatMessages([]);
    setArchiveSuccessMessage('');

    try {
      const full = await fetchFullThread(thread.id);
      setThreadMessages(full.messages);

      // Auto-trigger pre-archivization AI summary review
      triggerPreArchiveSummary(thread.subject, full.messages);
    } catch (err: any) {
      console.error('Failed to load thread details:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const triggerPreArchiveSummary = async (subject: string, messages: GmailMessageItem[]) => {
    setIsGeneratingSummary(true);
    try {
      const payload = {
        threadSubject: subject,
        messages: messages.map((m) => ({
          from: m.from,
          date: m.date,
          snippet: m.snippet,
          body: m.body,
        })),
      };

      const res = await fetch('/api/gemini/chat-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setThreadSummary(data.reply);
    } catch (err: any) {
      setThreadSummary(`Review summary unavailable: ${err.message}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPrompt.trim() || isChatting || !selectedThread) return;

    const currentPrompt = userPrompt.trim();
    setUserPrompt('');
    const newChatHistory: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: currentPrompt },
    ];
    setChatMessages(newChatHistory);
    setIsChatting(true);

    try {
      const payload = {
        threadSubject: selectedThread.subject,
        messages: threadMessages.map((m) => ({
          from: m.from,
          date: m.date,
          snippet: m.snippet,
          body: m.body,
        })),
        userPrompt: currentPrompt,
        history: chatMessages,
      };

      const res = await fetch('/api/gemini/chat-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Chatbot response error');
      const data = await res.json();

      setChatMessages([
        ...newChatHistory,
        { role: 'model', content: data.reply },
      ]);
    } catch (err: any) {
      setChatMessages([
        ...newChatHistory,
        { role: 'model', content: `Sorry, error processing inquiry: ${err.message}` },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleArchiveThread = () => {
    if (!selectedThread) return;

    // Explicit confirmation dialog per Workspace guidelines
    onRequestConfirmation({
      isOpen: true,
      title: 'Archive Gmail Thread',
      message: `Are you sure you want to archive "${selectedThread.subject}"? It will be removed from your Inbox while remaining available in All Mail.`,
      confirmLabel: 'Archive Email',
      isDestructive: false,
      onConfirm: async () => {
        setIsArchiving(true);
        try {
          await archiveGmailThread(selectedThread.id);
          setArchiveSuccessMessage('Thread successfully archived.');
          // Remove from local thread list
          setThreads((prev) => prev.filter((t) => t.id !== selectedThread.id));
          setSelectedThread(null);
          setThreadMessages([]);
        } catch (err: any) {
          alert(`Failed to archive: ${err.message}`);
        } finally {
          setIsArchiving(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Gmail Pre-Archival Review & AI Thread Chatbot
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Re-read full email chains before archiving, receive an AI-powered safety check on outstanding action items,
            and interact with a dedicated conversational bot to summarize decisions or draft replies.
          </p>
        </div>

        <button
          onClick={loadInbox}
          className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingThreads ? 'animate-spin' : ''}`} />
          <span>Refresh Inbox</span>
        </button>
      </div>

      {archiveSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-medium animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{archiveSuccessMessage}</span>
        </div>
      )}

      {/* Main 2-Column Split: Inbox List vs. Thread Details & Chatbot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Inbox Threads */}
        <div className="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Inbox Threads
            </h3>
            <span className="text-[11px] text-slate-400">{threads.length} conversations</span>
          </div>

          {isLoadingThreads ? (
            <div className="py-20 text-center text-xs text-slate-400">Loading inbox...</div>
          ) : threads.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">Your inbox is clear!</div>
          ) : (
            <div className="space-y-1.5 max-h-[620px] overflow-y-auto">
              {threads.map((thread) => {
                const isSelected = selectedThread?.id === thread.id;
                return (
                  <button
                    key={thread.id}
                    id={`thread-item-${thread.id}`}
                    onClick={() => handleSelectThread(thread)}
                    className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? 'bg-sky-50/80 border-sky-300 text-sky-950 shadow-2xs font-medium'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-slate-900 truncate max-w-[140px]">
                        {thread.from.split('<')[0].replace(/"/g, '')}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {thread.date ? new Date(thread.date).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="truncate font-medium text-slate-800 text-[11px]">{thread.subject}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{thread.snippet}</p>

                    <div className="flex items-center gap-1.5 mt-2">
                      {thread.isUnread && (
                        <span className="px-1.5 py-0.2 bg-sky-600 text-white rounded text-[9px] font-semibold">
                          Unread
                        </span>
                      )}
                      {thread.messagesCount && thread.messagesCount > 1 && (
                        <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-medium">
                          {thread.messagesCount} msgs
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Re-reading & AI Assistant */}
        <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          {selectedThread ? (
            <>
              {/* Thread Header & Safe Archiving Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 truncate max-w-lg">
                    {selectedThread.subject}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>{selectedThread.from}</span>
                    <span>•</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{selectedThread.date ? new Date(selectedThread.date).toLocaleString() : ''}</span>
                  </div>
                </div>

                <button
                  id="archive-thread-btn"
                  onClick={handleArchiveThread}
                  disabled={isArchiving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs shrink-0 disabled:opacity-50"
                >
                  <Archive className="w-4 h-4" />
                  <span>{isArchiving ? 'Archiving...' : 'Archive Thread'}</span>
                </button>
              </div>

              {/* Pre-Archival Safety Analysis Card */}
              <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span>Pre-Archivization AI Assessment</span>
                  {isGeneratingSummary && (
                    <RefreshCw className="w-3 h-3 animate-spin text-sky-600 ml-auto" />
                  )}
                </div>
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {threadSummary || 'Generating pre-archivization summary and safe-to-archive check...'}
                </div>
              </div>

              {/* Chronological Re-Reading Chain */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Full Email Chain ({threadMessages.length} Messages)
                </h4>

                {isLoadingMessages ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading messages...</div>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {threadMessages.map((msg, idx) => (
                      <div
                        key={msg.id}
                        className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-slate-200">
                          <span className="font-semibold text-slate-800">
                            #{idx + 1} {msg.from}
                          </span>
                          <span>{msg.date ? new Date(msg.date).toLocaleString() : ''}</span>
                        </div>
                        <div className="text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto font-sans text-xs">
                          {msg.body || msg.snippet}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Thread Chatbot */}
              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Bot className="w-4 h-4 text-sky-400" />
                  <span>Ask the Thread AI Chatbot</span>
                </div>

                {/* Chat History */}
                <div className="max-h-48 overflow-y-auto space-y-2 text-xs pr-1">
                  {chatMessages.length === 0 ? (
                    <p className="text-slate-400 italic text-[11px]">
                      Ask anything about this email thread: key decisions, action dates, pending confirmations, or draft a reply.
                    </p>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-slate-800 text-sky-200 ml-6 text-right'
                            : 'bg-slate-800/60 text-slate-200 mr-6'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 block mb-0.5">
                          {msg.role === 'user' ? 'You' : 'Gemini'}
                        </span>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    ))
                  )}
                  {isChatting && (
                    <div className="p-2 text-slate-400 text-xs italic animate-pulse">
                      Gemini is generating response...
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendChatMessage} className="flex gap-2">
                  <input
                    id="thread-chat-input"
                    type="text"
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Ask about this thread..."
                    disabled={isChatting}
                    className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                  />
                  <button
                    id="send-thread-chat-btn"
                    type="submit"
                    disabled={isChatting || !userPrompt.trim()}
                    className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="py-24 text-center space-y-2">
              <Mail className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-xs font-semibold text-slate-700">No Thread Selected</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select an email conversation on the left to review the full message chain before archiving.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
