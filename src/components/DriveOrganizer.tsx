import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FolderPlus,
  UploadCloud,
  Search,
  ExternalLink,
  Trash2,
  Move,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  File,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';
import { DriveFile, DriveFolderBreadcrumb, ConfirmationModalState } from '../types';
import {
  listDriveFiles,
  getFolderBreadcrumbs,
  createDriveFolder,
  moveDriveFile,
  deleteDriveFile,
  uploadFileToDrive,
  FOLDER_MIME_TYPE,
} from '../services/googleDrive';

interface DriveOrganizerProps {
  onAnalyzeDocument?: (file: DriveFile) => void;
  onRequestConfirmation: (config: ConfirmationModalState) => void;
}

export const DriveOrganizer: React.FC<DriveOrganizerProps> = ({
  onAnalyzeDocument,
  onRequestConfirmation,
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<DriveFolderBreadcrumb[]>([{ id: 'root', name: 'My Drive' }]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState<boolean>(false);
  const [draggedFile, setDraggedFile] = useState<DriveFile | null>(null);
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [selectedFileForInfo, setSelectedFileForInfo] = useState<DriveFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFolder = async (folderId: string = currentFolderId) => {
    setIsLoading(true);
    try {
      const [fetchedFiles, crumbs] = await Promise.all([
        listDriveFiles(folderId, searchQuery),
        getFolderBreadcrumbs(folderId),
      ]);
      setFiles(fetchedFiles);
      setBreadcrumbs(crumbs);
    } catch (err: any) {
      console.error('Error loading files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFolder(currentFolderId);
  }, [currentFolderId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadFolder(currentFolderId);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await createDriveFolder(newFolderName.trim(), currentFolderId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      loadFolder(currentFolderId);
    } catch (err: any) {
      alert(`Failed to create folder: ${err.message}`);
    }
  };

  // Drag-and-drop: Moving Drive file into a folder
  const handleDragStart = (e: React.DragEvent, file: DriveFile) => {
    e.dataTransfer.setData('text/plain', file.id);
    setDraggedFile(file);
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    if (draggedFile && draggedFile.id !== folderId) {
      setHoveredFolderId(folderId);
    }
  };

  const handleFolderDragLeave = () => {
    setHoveredFolderId(null);
  };

  const handleFolderDrop = (e: React.DragEvent, targetFolder: DriveFile) => {
    e.preventDefault();
    setHoveredFolderId(null);

    if (!draggedFile || draggedFile.id === targetFolder.id) return;

    const sourceFile = draggedFile;
    setDraggedFile(null);

    // Explicit confirmation dialog per Workspace safety rules
    onRequestConfirmation({
      isOpen: true,
      title: 'Move File in Google Drive',
      message: `Are you sure you want to move "${sourceFile.name}" into "${targetFolder.name}"?`,
      confirmLabel: 'Move File',
      isDestructive: false,
      onConfirm: async () => {
        try {
          await moveDriveFile(sourceFile.id, targetFolder.id, currentFolderId);
          loadFolder(currentFolderId);
        } catch (err: any) {
          alert(`Move failed: ${err.message}`);
        }
      },
    });
  };

  // Drag-and-drop: Upload local files to current Drive folder
  const handleLocalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverDropzone(false);

    // If it was an internal file drag, ignore
    if (e.dataTransfer.getData('text/plain')) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    await uploadFilesList(droppedFiles);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length > 0) {
      await uploadFilesList(selectedFiles);
    }
  };

  const uploadFilesList = async (filesList: File[]) => {
    setIsUploading(true);
    try {
      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        setUploadMessage(`Uploading ${file.name} (${i + 1}/${filesList.length})...`);
        await uploadFileToDrive(file, currentFolderId);
      }
      loadFolder(currentFolderId);
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
      setUploadMessage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = (file: DriveFile) => {
    onRequestConfirmation({
      isOpen: true,
      title: 'Delete from Google Drive',
      message: `Are you sure you want to permanently delete "${file.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDriveFile(file.id);
          loadFolder(currentFolderId);
        } catch (err: any) {
          alert(`Delete failed: ${err.message}`);
        }
      },
    });
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '--';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return '--';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === FOLDER_MIME_TYPE) {
      return <Folder className="w-5 h-5 text-amber-500 fill-amber-100" />;
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    }
    if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text/plain')) {
      return <FileText className="w-5 h-5 text-sky-600" />;
    }
    if (mimeType.includes('image')) {
      return <ImageIcon className="w-5 h-5 text-purple-600" />;
    }
    if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('code')) {
      return <FileCode className="w-5 h-5 text-indigo-600" />;
    }
    return <File className="w-5 h-5 text-slate-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Breadcrumb Path */}
        <div className="flex items-center flex-wrap gap-1 text-sm font-medium">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
              <button
                id={`breadcrumb-${crumb.id}`}
                onClick={() => setCurrentFolderId(crumb.id)}
                className={`px-2 py-1 rounded-md transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'text-slate-900 bg-slate-100 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              id="drive-search-input"
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800"
            />
          </form>

          <button
            id="refresh-drive-btn"
            onClick={() => loadFolder(currentFolderId)}
            title="Refresh folder"
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            id="create-folder-btn"
            onClick={() => setIsCreatingFolder(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors shadow-xs"
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            <span>New Folder</span>
          </button>

          <button
            id="upload-file-btn"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>
      </div>

      {/* New Folder Modal / Inline bar */}
      {isCreatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-200 flex items-center gap-3 animate-in fade-in"
        >
          <FolderPlus className="w-5 h-5 text-indigo-600 shrink-0" />
          <input
            id="new-folder-name-input"
            type="text"
            autoFocus
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm bg-white border border-indigo-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreatingFolder(false);
              setNewFolderName('');
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Uploading Status Banner */}
      {isUploading && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-center gap-3 text-sky-800 text-xs font-medium animate-pulse">
          <UploadCloud className="w-4 h-4 animate-bounce" />
          <span>{uploadMessage || 'Uploading file to Google Drive...'}</span>
        </div>
      )}

      {/* Drag-and-drop Dropzone & File Browser Grid */}
      <div
        id="drive-drag-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOverDropzone(true);
        }}
        onDragLeave={() => setIsDraggingOverDropzone(false)}
        onDrop={handleLocalDrop}
        className={`relative rounded-xl border-2 border-dashed transition-all p-4 ${
          isDraggingOverDropzone
            ? 'border-indigo-500 bg-indigo-50/50'
            : 'border-slate-200 bg-slate-50/40'
        }`}
      >
        {isDraggingOverDropzone && (
          <div className="absolute inset-0 bg-indigo-600/10 backdrop-blur-2xs rounded-xl flex items-center justify-center z-20 pointer-events-none">
            <div className="bg-white px-5 py-3 rounded-xl shadow-lg border border-indigo-200 flex items-center gap-2 text-indigo-700 font-semibold text-sm">
              <UploadCloud className="w-5 h-5" />
              <span>Drop files here to upload to this folder</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs font-medium">Reading Google Drive files...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="py-16 text-center">
            <Folder className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-700">This folder is empty</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Drag and drop local files directly here, or use the Upload and New Folder buttons above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table / List Header */}
            <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-400 border-b border-slate-200">
              <div className="col-span-6">Name</div>
              <div className="col-span-2 hidden md:block">Size</div>
              <div className="col-span-2 hidden md:block">Modified</div>
              <div className="col-span-6 md:col-span-2 text-right">Actions</div>
            </div>

            {/* Files & Folders */}
            <div className="space-y-1">
              {files.map((file) => {
                const isFolder = file.mimeType === FOLDER_MIME_TYPE;
                const isHoveredTarget = hoveredFolderId === file.id;

                return (
                  <div
                    key={file.id}
                    id={`file-item-${file.id}`}
                    draggable={!isFolder}
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragOver={isFolder ? (e) => handleFolderDragOver(e, file.id) : undefined}
                    onDragLeave={isFolder ? handleFolderDragLeave : undefined}
                    onDrop={isFolder ? (e) => handleFolderDrop(e, file) : undefined}
                    className={`grid grid-cols-12 items-center px-4 py-3 rounded-lg text-xs transition-all border ${
                      isHoveredTarget
                        ? 'bg-amber-100/70 border-amber-400 shadow-sm scale-[1.01]'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Name & Icon */}
                    <div className="col-span-6 flex items-center gap-3 min-w-0 pr-2">
                      <div className="shrink-0">{getFileIcon(file.mimeType)}</div>
                      {isFolder ? (
                        <button
                          id={`open-folder-${file.id}`}
                          onClick={() => setCurrentFolderId(file.id)}
                          className="font-medium text-slate-800 hover:text-indigo-600 truncate text-left transition-colors"
                        >
                          {file.name}
                        </button>
                      ) : (
                        <span className="font-medium text-slate-700 truncate" title={file.name}>
                          {file.name}
                        </span>
                      )}
                      {!isFolder && (
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0 hidden lg:inline">
                          <Move className="w-3 h-3 inline mr-1 opacity-60" />
                          Drag to move
                        </span>
                      )}
                    </div>

                    {/* Size */}
                    <div className="col-span-2 hidden md:block text-slate-500 font-mono">
                      {isFolder ? '--' : formatFileSize(file.size)}
                    </div>

                    {/* Date */}
                    <div className="col-span-2 hidden md:block text-slate-500">
                      {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '--'}
                    </div>

                    {/* Action buttons */}
                    <div className="col-span-6 md:col-span-2 flex items-center justify-end gap-1.5">
                      {/* Deep Extractor Tool trigger */}
                      {!isFolder && onAnalyzeDocument && (
                        <button
                          id={`analyze-file-${file.id}`}
                          onClick={() => onAnalyzeDocument(file)}
                          title="Extract and tag content with Gemini AI"
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* File Details dialog */}
                      <button
                        onClick={() => setSelectedFileForInfo(file)}
                        title="View details & properties"
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>

                      {/* Open in Drive link */}
                      {file.webViewLink && (
                        <a
                          id={`open-drive-link-${file.id}`}
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in Google Drive"
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {/* Delete */}
                      <button
                        id={`delete-file-${file.id}`}
                        onClick={() => handleDelete(file)}
                        title="Delete file"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Info Modal */}
      {selectedFileForInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {getFileIcon(selectedFileForInfo.mimeType)}
                <h3 className="font-semibold text-slate-800 text-sm truncate max-w-xs">
                  {selectedFileForInfo.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedFileForInfo(null)}
                className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 bg-slate-100 rounded"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 font-mono">
              <div>
                <span className="text-slate-400 block font-sans">Object ID:</span>
                <span className="bg-slate-100 px-2 py-1 rounded block select-all">
                  {selectedFileForInfo.id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">MIME Type:</span>
                <span>{selectedFileForInfo.mimeType}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Size:</span>
                <span>
                  {selectedFileForInfo.size ? `${selectedFileForInfo.size} bytes (${formatFileSize(selectedFileForInfo.size)})` : 'Folder / None'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Created Time:</span>
                <span>{selectedFileForInfo.createdTime || '--'}</span>
              </div>
              {selectedFileForInfo.description && (
                <div>
                  <span className="text-slate-400 block font-sans">AI Tags / Description:</span>
                  <p className="bg-slate-50 p-2 rounded text-slate-700 font-sans leading-relaxed">
                    {selectedFileForInfo.description}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {selectedFileForInfo.webViewLink && (
                <a
                  href={selectedFileForInfo.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Google Drive</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
