import { getAccessToken } from './auth';
import { DriveFile, DriveFolderBreadcrumb } from '../types';

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export async function listDriveFiles(
  folderId: string = 'root',
  searchQuery: string = ''
): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated. Please sign in with Google.');

  let q = `'${folderId}' in parents and trashed = false`;
  if (searchQuery.trim()) {
    q += ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`;
  }

  const fields =
    'files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, iconLink, thumbnailLink, description, starred, trashed)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=${encodeURIComponent(fields)}&orderBy=folder,name&pageSize=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Failed to fetch files: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function fetchFileDetails(fileId: string): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const fields =
    'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, iconLink, thumbnailLink, description';
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${encodeURIComponent(fields)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch file details');
  }

  return await res.json();
}

export async function getFolderBreadcrumbs(folderId: string): Promise<DriveFolderBreadcrumb[]> {
  if (folderId === 'root') {
    return [{ id: 'root', name: 'My Drive' }];
  }

  const crumbs: DriveFolderBreadcrumb[] = [];
  let currentId = folderId;

  // Max 6 levels to avoid infinite loop
  for (let i = 0; i < 6; i++) {
    if (currentId === 'root') {
      crumbs.unshift({ id: 'root', name: 'My Drive' });
      break;
    }
    try {
      const details = await fetchFileDetails(currentId);
      crumbs.unshift({ id: details.id, name: details.name });
      if (details.parents && details.parents.length > 0) {
        currentId = details.parents[0];
      } else {
        break;
      }
    } catch {
      crumbs.unshift({ id: currentId, name: 'Folder' });
      break;
    }
  }

  return crumbs.length > 0 ? crumbs : [{ id: 'root', name: 'My Drive' }];
}

export async function moveDriveFile(
  fileId: string,
  targetFolderId: string,
  previousFolderId?: string
): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  // If previousFolderId is not known, fetch current parents
  let removeParents = previousFolderId;
  if (!removeParents) {
    const file = await fetchFileDetails(fileId);
    removeParents = (file.parents || []).join(',');
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${encodeURIComponent(
    targetFolderId
  )}&removeParents=${encodeURIComponent(removeParents || '')}&fields=id,name,parents`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to move file');
  }

  return await res.json();
}

export async function createDriveFolder(name: string, parentFolderId: string = 'root'): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.trim(),
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentFolderId],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create folder');
  }

  return await res.json();
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to delete file');
  }
}

export async function uploadFileToDrive(file: File, parentFolderId: string = 'root'): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const metadata = {
    name: file.name,
    parents: [parentFolderId],
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const reader = new FileReader();
  const fileDataPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  const fileBytes = await fileDataPromise;

  const metadataContentType = 'application/json; charset=UTF-8';
  const fileContentType = file.type || 'application/octet-stream';

  const bodyParts = [
    delimiter,
    `Content-Type: ${metadataContentType}\r\n\r\n`,
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${fileContentType}\r\n\r\n`,
  ];

  const preBlob = new Blob(bodyParts);
  const postBlob = new Blob([closeDelimiter]);
  const finalBlob = new Blob([preBlob, fileBytes, postBlob]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: finalBlob,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to upload file');
  }

  return await res.json();
}

export async function fetchFileContent(fileId: string, mimeType: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  // If it's a Google Doc or Google Slide, export as plain text
  if (mimeType.includes('google-apps.document')) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) throw new Error('Failed to export Google Doc text content');
    return await res.text();
  }

  // If it's plain text, json, markdown, csv, or code
  if (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('javascript') ||
    mimeType.includes('csv') ||
    mimeType.includes('xml')
  ) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to download text content');
    return await res.text();
  }

  // For other binaries, return metadata summary
  const details = await fetchFileDetails(fileId);
  return `File Name: ${details.name}\nMIME Type: ${details.mimeType}\nSize: ${details.size || 'unknown'} bytes\nCreated: ${details.createdTime}\nDescription: ${details.description || 'none'}`;
}

export async function updateFileDescription(fileId: string, description: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });

  if (!res.ok) {
    throw new Error('Failed to update file description');
  }
}
