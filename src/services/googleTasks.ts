import { getAccessToken } from './auth';
import { GoogleTaskItem, GoogleTaskList } from '../types';

export async function fetchTaskLists(): Promise<GoogleTaskList[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to fetch task lists');
  }

  const data = await res.json();
  return data.items || [];
}

export async function fetchTasks(taskListId: string = '@default'): Promise<GoogleTaskItem[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to fetch tasks');
  }

  const data = await res.json();
  return (data.items || []).map((t: any) => ({
    id: t.id,
    title: t.title || '(Untitled Task)',
    status: t.status as 'needsAction' | 'completed',
    due: t.due,
    completed: t.completed,
    notes: t.notes,
    updated: t.updated,
  }));
}

export async function createGoogleTask(
  taskListId: string = '@default',
  task: { title: string; notes?: string; due?: string }
): Promise<GoogleTaskItem> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: task.title,
      notes: task.notes || '',
      due: task.due ? new Date(task.due).toISOString() : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create task');
  }

  return await res.json();
}

export async function toggleTaskCompletion(
  taskListId: string = '@default',
  taskId: string,
  isCompleted: boolean
): Promise<GoogleTaskItem> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: isCompleted ? 'completed' : 'needsAction',
      completed: isCompleted ? new Date().toISOString() : null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to update task');
  }

  return await res.json();
}
