import { getAccessToken } from './auth';
import { GmailMessageItem, GmailThreadItem } from '../types';

function decodeBase64Url(input: string): string {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(base64);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function extractBodyFromPayload(payload: any): string {
  if (!payload) return '';

  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    // Look for text/plain first
    const plainPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plainPart && plainPart.body && plainPart.body.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    // Otherwise text/html
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart && htmlPart.body && htmlPart.body.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      // Strip simple html tags
      return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                 .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                 .replace(/<[^>]+>/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
    }

    // Check nested parts
    for (const part of payload.parts) {
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }

  return '';
}

export async function fetchInboxThreads(
  maxResults: number = 20,
  query: string = 'in:inbox'
): Promise<GmailThreadItem[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}&q=${encodeURIComponent(
      query
    )}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to list Gmail threads');
  }

  const listData = await listRes.json();
  const rawThreads = listData.threads || [];
  if (rawThreads.length === 0) return [];

  // Fetch summary metadata for the threads in parallel batches
  const threads: GmailThreadItem[] = await Promise.all(
    rawThreads.map(async (t: { id: string; snippet: string; historyId: string }) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!detailRes.ok) {
          return {
            id: t.id,
            snippet: t.snippet || '',
            historyId: t.historyId,
            subject: '(No Subject)',
            from: 'Unknown',
            date: '',
            labels: [],
            isUnread: false,
          };
        }
        const data = await detailRes.json();
        const firstMsg = data.messages?.[0];
        const lastMsg = data.messages?.[data.messages.length - 1];

        const getHeader = (msg: any, name: string) =>
          msg?.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
            ?.value || '';

        const subject = getHeader(firstMsg, 'Subject') || '(No Subject)';
        const from = getHeader(lastMsg || firstMsg, 'From') || 'Unknown';
        const date = getHeader(lastMsg || firstMsg, 'Date') || '';
        const allLabels: string[] = Array.from(
          new Set(data.messages?.flatMap((m: any) => m.labelIds || []) || [])
        );

        return {
          id: t.id,
          snippet: t.snippet || '',
          historyId: t.historyId,
          messagesCount: data.messages?.length || 1,
          subject,
          from,
          date,
          labels: allLabels,
          isUnread: allLabels.includes('UNREAD'),
        };
      } catch {
        return {
          id: t.id,
          snippet: t.snippet || '',
          subject: '(No Subject)',
          from: 'Unknown',
          date: '',
          labels: [],
          isUnread: false,
        };
      }
    })
  );

  return threads;
}

export async function fetchFullThread(threadId: string): Promise<{
  id: string;
  messages: GmailMessageItem[];
}> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error('Failed to retrieve full thread details');
  }

  const data = await res.json();
  const messages: GmailMessageItem[] = (data.messages || []).map((msg: any) => {
    const getHeader = (name: string) =>
      msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ||
      '';

    const bodyText = extractBodyFromPayload(msg.payload);

    return {
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet || '',
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      subject: getHeader('Subject'),
      body: bodyText || msg.snippet || '',
      labels: msg.labelIds || [],
    };
  });

  return { id: data.id, messages };
}

export async function archiveGmailThread(threadId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        removeLabelIds: ['INBOX'],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to archive email thread');
  }
}
