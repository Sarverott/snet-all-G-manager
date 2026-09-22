import React, { useState, useEffect } from 'react';
import {
  CalendarCheck2,
  Sparkles,
  CheckCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  Layers,
} from 'lucide-react';
import { GoogleTaskItem, MonthlyReportResult, ConfirmationModalState } from '../types';
import {
  fetchTasks,
  createGoogleTask,
  toggleTaskCompletion,
} from '../services/googleTasks';
import { listDriveFiles } from '../services/googleDrive';
import { fetchInboxThreads } from '../services/gmail';

interface MonthlyReportPlannerProps {
  onRequestConfirmation: (config: ConfirmationModalState) => void;
}

export const MonthlyReportPlanner: React.FC<MonthlyReportPlannerProps> = ({
  onRequestConfirmation,
}) => {
  const currentDate = new Date();
  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const [selectedMonth, setSelectedMonth] = useState<string>(monthsList[currentDate.getMonth()]);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());

  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskNotes, setNewTaskNotes] = useState<string>('');
  const [isLoadingTasks, setIsLoadingTasks] = useState<boolean>(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [reportResult, setReportResult] = useState<MonthlyReportResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const loadTasksList = async () => {
    setIsLoadingTasks(true);
    try {
      const fetched = await fetchTasks('@default');
      setTasks(fetched);
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadTasksList();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      await createGoogleTask('@default', {
        title: newTaskTitle.trim(),
        notes: newTaskNotes.trim() || undefined,
      });
      setNewTaskTitle('');
      setNewTaskNotes('');
      loadTasksList();
    } catch (err: any) {
      alert(`Failed to add task: ${err.message}`);
    }
  };

  const handleToggleTask = async (task: GoogleTaskItem) => {
    const isCompleted = task.status === 'completed';
    try {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: isCompleted ? 'needsAction' : 'completed' }
            : t
        )
      );
      await toggleTaskCompletion('@default', task.id, !isCompleted);
    } catch (err: any) {
      alert(`Failed to update task: ${err.message}`);
      loadTasksList();
    }
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setStatusMessage('Analyzing tasks, Drive documents, and inbox activity with Gemini 3.8 Flash...');

    try {
      // Collect context from Drive & Gmail
      const [driveFiles, gmailThreads] = await Promise.all([
        listDriveFiles('root').catch(() => []),
        fetchInboxThreads(20).catch(() => []),
      ]);

      const payload = {
        monthName: selectedMonth,
        year: selectedYear,
        plannedTasks: tasks.map((t) => ({
          title: t.title,
          completed: t.status === 'completed',
          due: t.due,
          notes: t.notes,
        })),
        driveStats: {
          filesCount: driveFiles.length,
          topFiles: driveFiles.slice(0, 8).map((f) => f.name),
        },
        emailStats: {
          threadsCount: gmailThreads.length,
          unreadCount: gmailThreads.filter((t) => t.isUnread).length,
        },
      };

      const res = await fetch('/api/gemini/monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Report generation API error');
      }

      const data: MonthlyReportResult = await res.json();
      setReportResult(data);
      setStatusMessage('Report generated successfully.');
    } catch (err: any) {
      console.error('Report generation error:', err);
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleAddRecommendedToTasks = () => {
    if (!reportResult || !reportResult.nextMonthActionPlan) return;

    onRequestConfirmation({
      isOpen: true,
      title: 'Import AI Action Plan to Google Tasks',
      message: `Add ${reportResult.nextMonthActionPlan.length} recommended action plan items directly to your Google Workspace Tasks?`,
      confirmLabel: 'Add All to Tasks',
      isDestructive: false,
      onConfirm: async () => {
        try {
          for (const item of reportResult.nextMonthActionPlan) {
            await createGoogleTask('@default', {
              title: item.title,
              notes: `[Priority: ${item.priority.toUpperCase()}] [Category: ${item.category}]`,
            });
          }
          alert('Recommended tasks synced with Google Workspace Tasks!');
          loadTasksList();
        } catch (err: any) {
          alert(`Failed to sync tasks: ${err.message}`);
        }
      },
    });
  };

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const completionPercentage = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Automated Monthly Task Tracking & Plan Fulfillment Report
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Compare planned tasks with actual fulfillment, evaluate monthly velocity across Google Workspace,
            and generate next month&apos;s actionable TODO agenda with AI.
          </p>
        </div>

        {/* Month Selector & Generate Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            id="select-month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
          >
            {monthsList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            id="select-year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            id="generate-monthly-report-btn"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isGeneratingReport ? 'animate-spin' : ''}`} />
            <span>{isGeneratingReport ? 'Generating Report...' : 'Generate Monthly Report'}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium">
          {statusMessage}
        </div>
      )}

      {/* Main Grid: Google Tasks Management vs. Monthly Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tasks / TODO List synced with Google Tasks */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Google Workspace Tasks ({tasks.length})
              </h3>
              <p className="text-[11px] text-slate-400">
                {completedCount} completed ({completionPercentage}%)
              </p>
            </div>
            <button
              onClick={loadTasksList}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              title="Refresh tasks"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTasks ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {/* Add Task Form */}
          <form onSubmit={handleCreateTask} className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <input
              id="new-task-title-input"
              type="text"
              placeholder="Add new planned task..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex items-center gap-2">
              <input
                id="new-task-notes-input"
                type="text"
                placeholder="Optional notes or deadline..."
                value={newTaskNotes}
                onChange={(e) => setNewTaskNotes(e.target.value)}
                className="flex-1 px-3 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden"
              />
              <button
                id="add-task-btn"
                type="submit"
                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </form>

          {/* Task Items List */}
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {isLoadingTasks ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No tasks logged. Add your first planned goal above!
              </div>
            ) : (
              tasks.map((task) => {
                const isCompleted = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs transition-colors ${
                      isCompleted
                        ? 'bg-slate-50/70 border-slate-200 text-slate-400'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={() => handleToggleTask(task)}
                      className="mt-0.5 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                        {task.title}
                      </p>
                      {task.notes && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{task.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Automated Monthly Report Result */}
        <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          {reportResult ? (
            <>
              {/* Score Banner */}
              <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-sky-400 uppercase tracking-widest font-semibold block">
                    {selectedMonth} {selectedYear} Fulfillment Evaluation
                  </span>
                  <h3 className="text-xl font-bold tracking-tight mt-0.5">
                    {reportResult.fulfillmentLevel}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold text-sky-300">
                    {reportResult.fulfillmentScore}%
                  </div>
                  <span className="text-[11px] text-slate-300">Degree of plan fulfilled</span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <span>Month Passed Synthesized Summary</span>
                </h4>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {reportResult.executiveSummary}
                </div>
              </div>

              {/* Achievements vs Unfulfilled Items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Achievements */}
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Key Milestones & Achievements</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                    {reportResult.achievements.map((item, idx) => (
                      <li key={idx} className="leading-normal">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Unfulfilled / Bottlenecks */}
                <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Unfulfilled Items & Insights</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                    {reportResult.unfulfilledItems.map((item, idx) => (
                      <li key={idx} className="leading-normal">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Next Month Action Plan */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Recommended Next Month Action Plan (TODO Agenda)</span>
                  </div>
                  <button
                    id="add-recommended-tasks-btn"
                    onClick={handleAddRecommendedToTasks}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Import to Google Tasks</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {reportResult.nextMonthActionPlan.map((action, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{action.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-medium">
                          {action.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            action.priority === 'high'
                              ? 'bg-rose-100 text-rose-700'
                              : action.priority === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {action.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-24 text-center space-y-3">
              <CalendarCheck2 className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-xs font-semibold text-slate-700">No Report Generated Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select your month above and click &quot;Generate Monthly Report&quot; to compute fulfillment rates,
                synthesize achievements across Google Workspace, and plan your upcoming agenda.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
