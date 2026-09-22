import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  FolderTree,
  TableProperties,
} from 'lucide-react';
import { DriveFile } from '../types';
import { listDriveFiles, getFolderBreadcrumbs } from '../services/googleDrive';
import { createDriveCatalogSpreadsheet, CatalogExportRow } from '../services/googleSheets';

export const SheetsCatalogExport: React.FC = () => {
  const [folderScope, setFolderScope] = useState<string>('root');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderPathName, setFolderPathName] = useState<string>('My Drive');
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [isGeneratingAiLook, setIsGeneratingAiLook] = useState<boolean>(false);
  const [isExportingToSheets, setIsExportingToSheets] = useState<boolean>(false);
  const [aiDescriptions, setAiDescriptions] = useState<Record<string, string>>({});
  const [createdSheetResult, setCreatedSheetResult] = useState<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [sheetTitle, setSheetTitle] = useState<string>(
    `GDrive Catalog - ${new Date().toISOString().slice(0, 10)}`
  );

  const fetchFilesForCatalog = async () => {
    setIsLoadingFiles(true);
    try {
      const fetched = await listDriveFiles(folderScope);
      const crumbs = await getFolderBreadcrumbs(folderScope);
      setFolderPathName(crumbs.map((c) => c.name).join(' / '));
      setFiles(fetched);
    } catch (err: any) {
      console.error('Error fetching files for catalog:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFilesForCatalog();
  }, [folderScope]);

  const handleRunAiQuickLook = async () => {
    if (files.length === 0) return;
    setIsGeneratingAiLook(true);
    setStatusMessage('Analyzing files with Gemini 3.8 Flash for quick-look summaries...');

    try {
      const payloadFiles = files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        snippet: f.description || '',
      }));

      const res = await fetch('/api/gemini/quick-look', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payloadFiles }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate AI quick-look descriptions');
      }

      const data = await res.json();
      setAiDescriptions(data.descriptions || {});
      setStatusMessage('AI Quick-Look descriptions generated successfully.');
    } catch (err: any) {
      console.error('Quick look error:', err);
      setStatusMessage(`AI Quick-Look warning: ${err.message}`);
    } finally {
      setIsGeneratingAiLook(false);
    }
  };

  const handleExportToGoogleSheets = async () => {
    if (files.length === 0) return;
    setIsExportingToSheets(true);
    setStatusMessage('Provisioning new Google Spreadsheet and inserting formatted inventory rows...');

    try {
      const rows: CatalogExportRow[] = files.map((f) => {
        const bytes = f.size ? parseInt(f.size, 10) : 0;
        let formattedSize = '--';
        if (f.size) {
          if (bytes < 1024) formattedSize = `${bytes} B`;
          else if (bytes < 1024 * 1024) formattedSize = `${(bytes / 1024).toFixed(1)} KB`;
          else formattedSize = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        return {
          objectId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          createdTime: f.createdTime ? new Date(f.createdTime).toLocaleString() : '--',
          aiDescription: aiDescriptions[f.id] || f.description || 'No description generated',
          sizeBytes: f.size || '0',
          sizeFormatted: formattedSize,
          folderPath: folderPathName,
          driveLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        };
      });

      const result = await createDriveCatalogSpreadsheet(sheetTitle, rows);
      setCreatedSheetResult(result);
      setStatusMessage('Spreadsheet generated and styled successfully!');
    } catch (err: any) {
      console.error('Export to sheets error:', err);
      setStatusMessage(`Failed to export to Google Sheets: ${err.message}`);
    } finally {
      setIsExportingToSheets(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Google Sheets File Catalog & AI Inventory
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Export a full metadata manifest of your Google Drive items directly into a real Google Sheet,
            including Object ID, name, MIME type, creation datetime, AI quick-look description, formatted size, folder path, and direct Drive links.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="run-quick-look-ai-btn"
            onClick={handleRunAiQuickLook}
            disabled={isGeneratingAiLook || files.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isGeneratingAiLook ? 'animate-spin' : ''}`} />
            <span>{isGeneratingAiLook ? 'Generating AI Looks...' : 'Generate AI Descriptions'}</span>
          </button>

          <button
            id="export-catalog-btn"
            onClick={handleExportToGoogleSheets}
            disabled={isExportingToSheets || files.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
          >
            <FileSpreadsheet className={`w-4 h-4 ${isExportingToSheets ? 'animate-spin' : ''}`} />
            <span>{isExportingToSheets ? 'Exporting to Sheets...' : 'Create Google Sheet'}</span>
          </button>
        </div>
      </div>

      {/* Success Notification with direct link */}
      {createdSheetResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-900">
                Google Sheet Created Successfully!
              </h4>
              <p className="text-xs text-emerald-700">
                Your file inventory with AI descriptions, object IDs, and links has been populated into a new spreadsheet.
              </p>
            </div>
          </div>
          <a
            id="open-created-sheet-link"
            href={createdSheetResult.spreadsheetUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            <span>Open in Google Sheets</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Status banner */}
      {statusMessage && !createdSheetResult && (
        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium">
          {statusMessage}
        </div>
      )}

      {/* Controls & Configuration */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Spreadsheet Title
            </label>
            <input
              id="sheet-title-input"
              type="text"
              value={sheetTitle}
              onChange={(e) => setSheetTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Catalog Path Scope
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                <FolderTree className="w-4 h-4 text-slate-400" />
                <span className="truncate">{folderPathName}</span>
              </div>
              <button
                onClick={fetchFilesForCatalog}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                title="Refresh files"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Catalog Preview Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <TableProperties className="w-4 h-4 text-slate-500" />
              <span>Manifest Preview ({files.length} items ready to export)</span>
            </div>
            <span className="text-[11px] text-slate-400">
              {Object.keys(aiDescriptions).length} AI descriptions prepared
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoadingFiles ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Loading files for spreadsheet...
              </div>
            ) : files.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No files found in this folder.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Object ID</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">MIME Type</th>
                    <th className="py-2 px-3">AI Quick Look</th>
                    <th className="py-2 px-3">Size</th>
                    <th className="py-2 px-3">Path</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {files.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 max-w-[100px] truncate select-all">
                        {file.id}
                      </td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-800 max-w-[180px] truncate">
                        {file.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-[140px] truncate">
                        {file.mimeType.replace('application/', '').replace('vnd.google-apps.', 'gapps:')}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-700 max-w-[220px] truncate">
                        {aiDescriptions[file.id] ? (
                          <span className="text-indigo-600 font-medium">
                            {aiDescriptions[file.id]}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            {file.description || 'Click "Generate AI Descriptions"'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {file.size ? `${(parseInt(file.size, 10) / 1024).toFixed(1)} KB` : '--'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-500 max-w-[120px] truncate">
                        {folderPathName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
