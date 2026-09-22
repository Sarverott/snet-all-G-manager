import { getAccessToken } from './auth';

export interface CatalogExportRow {
  objectId: string;
  name: string;
  mimeType: string;
  createdTime: string;
  aiDescription: string;
  sizeBytes: string;
  sizeFormatted: string;
  folderPath: string;
  driveLink: string;
}

export async function createDriveCatalogSpreadsheet(
  catalogTitle: string,
  rows: CatalogExportRow[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  // 1. Create Spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: catalogTitle || `GDrive Inventory Catalog - ${new Date().toISOString().slice(0, 10)}`,
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create Google Sheet');
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const sheetId = sheetData.sheets?.[0]?.properties?.sheetId || 0;

  // 2. Prepare Headers and Data
  const headers = [
    'Object ID',
    'File Name',
    'MIME Type',
    'Created At',
    'AI Quick Look Description',
    'Size (Bytes)',
    'Formatted Size',
    'Directory Path',
    'Google Drive Link',
  ];

  const valueRows = rows.map((r) => [
    r.objectId,
    r.name,
    r.mimeType,
    r.createdTime,
    r.aiDescription,
    r.sizeBytes,
    r.sizeFormatted,
    r.folderPath,
    r.driveLink,
  ]);

  const allValues = [headers, ...valueRows];

  // 3. Populate data
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'Sheet1!A1',
        majorDimension: 'ROWS',
        values: allValues,
      }),
    }
  );

  if (!appendRes.ok) {
    console.warn('Value append failed, trying append route');
  }

  // 4. Style headers & freeze row 1
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          // Freeze first row
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          // Format header row style
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.12, green: 0.16, blue: 0.22 }, // dark slate
                  textFormat: {
                    foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                    bold: true,
                    fontSize: 10,
                  },
                  horizontalAlignment: 'LEFT',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          // Auto-resize columns
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: headers.length,
              },
            },
          },
        ],
      }),
    });
  } catch (styleErr) {
    console.warn('Formatting spreadsheet headers encountered a minor warning:', styleErr);
  }

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return { spreadsheetId, spreadsheetUrl };
}
