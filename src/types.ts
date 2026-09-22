export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
}

export interface DriveFolderBreadcrumb {
  id: string;
  name: string;
}

export interface DocumentAnalysisResult {
  summary: string;
  tags: string[];
  category: string;
  keyTakeaways: string[];
  actionItems: string[];
  entities: string[];
}

export interface GmailThreadItem {
  id: string;
  snippet: string;
  historyId?: string;
  messagesCount?: number;
  subject: string;
  from: string;
  date: string;
  labels: string[];
  isUnread: boolean;
}

export interface GmailMessageItem {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
  labels: string[];
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  notes?: string;
  updated?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface MonthlyReportResult {
  fulfillmentScore: number;
  fulfillmentLevel: string;
  executiveSummary: string;
  achievements: string[];
  unfulfilledItems: string[];
  insightsAndBottlenecks: string[];
  nextMonthActionPlan: Array<{
    title: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
  }>;
}

export interface ConfirmationModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
}
