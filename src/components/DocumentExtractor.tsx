import React, { useState, useEffect } from 'react';
import {
  FileSearch,
  Sparkles,
  Tag,
  Save,
  CheckCircle,
  FileText,
  ListTree,
  Building,
  Target,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { DriveFile, DocumentAnalysisResult, ConfirmationModalState } from '../types';
import { listDriveFiles, fetchFileContent, updateFileDescription } from '../services/googleDrive';

interface DocumentExtractorProps {
  initialFile?: DriveFile | null;
  onRequestConfirmation: (config: ConfirmationModalState) => void;
}

export const DocumentExtractor: React.FC<DocumentExtractorProps> = ({
  initialFile,
  onRequestConfirmation,
}) => {
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(initialFile || null);
  const [extractedContent, setExtractedContent] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'analysis' | 'content'>('analysis');

  useEffect(() => {
    if (initialFile) {
      setSelectedFile(initialFile);
      handleFileSelected(initialFile);
    }
  }, [initialFile]);

  useEffect(() => {
    // Load documents from Drive
    const loadFiles = async () => {
      try {
        const files = await listDriveFiles('root');
        // Filter for documents, text, pdfs, etc.
        const docs = files.filter(
          (f) =>
            f.mimeType !== 'application/vnd.google-apps.folder' &&
            !f.mimeType.includes('image')
        );
        setDriveFiles(docs);
        if (!selectedFile && docs.length > 0) {
          setSelectedFile(docs[0]);
          handleFileSelected(docs[0]);
        }
      } catch (err) {
        console.error('Failed to load drive files:', err);
      }
    };
    loadFiles();
  }, []);

  const handleFileSelected = async (file: DriveFile) => {
    setSelectedFile(file);
    setIsExtracting(true);
    setAnalysisResult(null);
    setSaveSuccessMessage('');

    try {
      const text = await fetchFileContent(file.id, file.mimeType);
      setExtractedContent(text);
    } catch (err: any) {
      setExtractedContent(`Could not extract raw text: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setSaveSuccessMessage('');

    try {
      const res = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedFile.name,
          mimeType: selectedFile.mimeType,
          content: extractedContent || selectedFile.name,
        }),
      });

      if (!res.ok) {
        throw new Error('Analysis request failed');
      }

      const result: DocumentAnalysisResult = await res.json();
      setAnalysisResult(result);
      setActiveTab('analysis');
    } catch (err: any) {
      alert(`AI Analysis error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveTagsToDrive = () => {
    if (!selectedFile || !analysisResult) return;

    onRequestConfirmation({
      isOpen: true,
      title: 'Update Google Drive Metadata',
      message: `Save generated tags, category, and summary to "${selectedFile.name}" on Google Drive? This enriches Drive searchability.`,
      confirmLabel: 'Save to Drive',
      isDestructive: false,
      onConfirm: async () => {
        setIsSavingToDrive(true);
        try {
          const descriptionPayload = `[Category: ${analysisResult.category}]\n[Tags: ${analysisResult.tags.join(', ')}]\n\nSummary:\n${analysisResult.summary}`;
          await updateFileDescription(selectedFile.id, descriptionPayload);
          setSaveSuccessMessage('Tags & AI summary saved to Google Drive metadata!');
        } catch (err: any) {
          alert(`Failed to save to Drive: ${err.message}`);
        } finally {
          setIsSavingToDrive(false);
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
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileSearch className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Document Extractor & Semantic AI Tagging
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Automatically extract document contents, generate deep executive summaries, extract structured entities,
            and create searchable semantic tags. Save metadata directly to Google Drive files for search indexing.
          </p>
        </div>

        {selectedFile && (
          <div className="flex items-center gap-2">
            <button
              id="run-analysis-btn"
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || isExtracting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Analyzing with Gemini...' : 'Analyze Document'}</span>
            </button>
          </div>
        )}
      </div>

      {saveSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-medium animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: File Selector */}
        <div className="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Select Document
            </h3>
            <span className="text-[11px] text-slate-400">{driveFiles.length} files</span>
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {driveFiles.map((file) => {
              const isSelected = selectedFile?.id === file.id;
              return (
                <button
                  key={file.id}
                  id={`select-doc-${file.id}`}
                  onClick={() => handleFileSelected(file)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 shadow-2xs font-medium'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">
                      {file.mimeType.replace('application/vnd.google-apps.', '')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Analysis & Extraction Results */}
        <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
          {/* File Title Bar */}
          {selectedFile && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <span className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">
                  Target Document
                </span>
                <h3 className="text-sm font-semibold text-slate-800 truncate max-w-md">
                  {selectedFile.name}
                </h3>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('analysis')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'analysis'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AI Analysis & Tags
                </button>
                <button
                  onClick={() => setActiveTab('content')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'content'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Raw Extracted Content
                </button>
              </div>
            </div>
          )}

          {isExtracting ? (
            <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-xs">Extracting text from Google Drive...</span>
            </div>
          ) : activeTab === 'content' ? (
            <div className="space-y-2">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                {extractedContent || 'No text extracted.'}
              </div>
            </div>
          ) : analysisResult ? (
            <div className="space-y-5">
              {/* Category & Tags Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Category:</span>
                  <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-md text-xs font-semibold">
                    {analysisResult.category}
                  </span>
                </div>

                <button
                  id="save-tags-drive-btn"
                  onClick={handleSaveTagsToDrive}
                  disabled={isSavingToDrive}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingToDrive ? 'Saving to Drive...' : 'Save Tags to GDrive File'}</span>
                </button>
              </div>

              {/* Semantic Tags Pills */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  <span>Searchable Semantic Tags</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {analysisResult.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-md text-xs font-medium text-slate-700 transition-colors"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Executive Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <ListTree className="w-4 h-4 text-indigo-600" />
                  <span>Executive Summary</span>
                </div>
                <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {analysisResult.summary}
                </div>
              </div>

              {/* Key Takeaways & Action Items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Takeaways */}
                <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <Target className="w-4 h-4 text-sky-600" />
                    <span>Key Takeaways</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                    {analysisResult.keyTakeaways.map((item, idx) => (
                      <li key={idx} className="leading-normal">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action Items */}
                <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                    <span>Action Items Identified</span>
                  </div>
                  {analysisResult.actionItems.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No explicit tasks found</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                      {analysisResult.actionItems.map((item, idx) => (
                        <li key={idx} className="leading-normal">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Entities */}
              {analysisResult.entities.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Building className="w-4 h-4 text-purple-600" />
                    <span>Identified Entities & Dates</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {analysisResult.entities.map((ent, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-purple-50 border border-purple-200 rounded text-[11px] font-medium text-purple-700"
                      >
                        {ent}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center space-y-3">
              <FileSearch className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select a document from the left and click &quot;Analyze Document&quot; to extract key summaries,
                action items, and searchable semantic tags with Gemini 3.8 Flash.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
