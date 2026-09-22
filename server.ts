import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const PORT = 3000;
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 1. Quick Look file descriptions for Google Sheets export
  app.post('/api/gemini/quick-look', async (req: Request, res: Response) => {
    try {
      const { files } = req.body as { files: Array<{ id: string; name: string; mimeType: string; snippet?: string }> };
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'files array is required' });
      }

      const ai = getAIClient();
      const prompt = `You are a digital archivist. For each of the following files from Google Drive, generate a concise, accurate 1-2 sentence description explaining what the file likely contains or is used for based on its name, mime type, and any excerpt provided.
Return the output as a JSON object mapping file IDs to their descriptions.

Files:
${JSON.stringify(files.slice(0, 30), null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            description: 'Map of file ID to concise description',
            properties: files.reduce((acc, f) => {
              acc[f.id] = { type: Type.STRING, description: `Description for ${f.name}` };
              return acc;
            }, {} as Record<string, any>),
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ descriptions: parsed });
    } catch (err: any) {
      console.error('Error in /api/gemini/quick-look:', err);
      return res.status(500).json({ error: err.message || 'Failed to generate descriptions' });
    }
  });

  // 2. Deep Document Content Extractor & Smart Tagging
  app.post('/api/gemini/analyze-document', async (req: Request, res: Response) => {
    try {
      const { title, mimeType, content } = req.body as { title: string; mimeType: string; content: string };
      if (!content && !title) {
        return res.status(400).json({ error: 'title and content or snippet are required' });
      }

      const ai = getAIClient();
      const prompt = `Analyze this document thoroughly for searchability, metadata enrichment, and organization in Google Drive.
Document Title: "${title}"
MIME Type: "${mimeType}"
Content Sample / Full Text:
${(content || 'No text extracted').slice(0, 20000)}

Extract:
1. summary: A clear 2-3 paragraph executive summary of the document.
2. tags: 6-10 high-value semantic search tags (lowercase, hyphen-free where appropriate).
3. category: The primary functional category (e.g., Financial, Contract/Legal, Engineering, Strategy, Notes, Meeting Minutes, Product Specs, Personal).
4. keyTakeaways: 3 to 6 bullet points of the most essential decisions or facts.
5. actionItems: Any explicit or implied tasks/actions found in the text.
6. entities: Important organizations, people, products, or dates identified.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              category: { type: Type.STRING },
              keyTakeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              actionItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              entities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['summary', 'tags', 'category', 'keyTakeaways', 'actionItems', 'entities'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    } catch (err: any) {
      console.error('Error in /api/gemini/analyze-document:', err);
      return res.status(500).json({ error: err.message || 'Failed to analyze document' });
    }
  });

  // 3. Gmail Thread Re-reading, Summarization & Chatbot
  app.post('/api/gemini/chat-thread', async (req: Request, res: Response) => {
    try {
      const {
        threadSubject,
        messages,
        userPrompt,
        history = [],
      } = req.body as {
        threadSubject: string;
        messages: Array<{ from: string; date: string; snippet: string; body?: string }>;
        userPrompt?: string;
        history?: Array<{ role: 'user' | 'model'; content: string }>;
      };

      const ai = getAIClient();
      const threadContext = `Thread Subject: "${threadSubject || '(No Subject)'}"
Number of messages: ${messages?.length || 0}
Email Chain:
${(messages || [])
  .map(
    (m, idx) =>
      `[Message ${idx + 1}] From: ${m.from} | Date: ${m.date}\nSnippet: ${m.snippet}\nContent: ${(m.body || m.snippet || '').slice(0, 2500)}`
  )
  .join('\n---\n')}`;

      if (!userPrompt) {
        // Initial thread analysis & readiness for archivization
        const prompt = `You are an AI inbox assistant helping a busy professional review this email thread before archiving.
Provide:
1. A concise overview of what this thread was about and what resolution was reached.
2. Status: Whether this thread is safe to archive (e.g. "Safe to Archive - All items resolved" or "Needs Follow-Up - Pending response from X").
3. Outstanding Action Items: Any open questions or pending commitments.
4. Key Participants & Dates.

Email Thread Data:
${threadContext}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        return res.json({ reply: response.text });
      } else {
        // Conversational Q&A about this thread
        const conversationContents = [
          {
            role: 'user',
            parts: [{ text: `Here is the email thread context for reference:\n${threadContext}` }],
          },
          {
            role: 'model',
            parts: [{ text: `I have thoroughly read this email thread regarding "${threadSubject}". How can I help you with this conversation?` }],
          },
          ...history.map((h) => ({
            role: h.role,
            parts: [{ text: h.content }],
          })),
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ];

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: conversationContents as any,
          config: {
            systemInstruction: 'You are an insightful Gmail assistant. Answer questions directly using the email thread context. Be clear, succinct, and highlight action items or dates.',
          },
        });

        return res.json({ reply: response.text });
      }
    } catch (err: any) {
      console.error('Error in /api/gemini/chat-thread:', err);
      return res.status(500).json({ error: err.message || 'Failed to process email thread' });
    }
  });

  // 4. Automated Monthly Report & Plan vs. Actual Comparison
  app.post('/api/gemini/monthly-report', async (req: Request, res: Response) => {
    try {
      const {
        monthName,
        year,
        plannedTasks = [],
        driveStats = {},
        emailStats = {},
      } = req.body;

      const ai = getAIClient();
      const prompt = `You are an executive productivity analyst and planning strategist.
Generate an automated Monthly Progress & Plan Fulfillment Report for ${monthName} ${year}.

Data Input:
- Planned TODOs / Tasks for the period:
${JSON.stringify(plannedTasks, null, 2)}
- Google Drive Activity:
${JSON.stringify(driveStats, null, 2)}
- Gmail Inbox Activity:
${JSON.stringify(emailStats, null, 2)}

Provide a rigorous, motivating, and constructive evaluation comparing the planned tasks with the fulfilled results:
1. fulfillmentScore: Calculated fulfillment percentage (0 to 100).
2. fulfillmentLevel: Rating ("Exceeded Targets", "Strong Completion", "Moderate Progress", "Needs Attention").
3. executiveSummary: 2-3 paragraphs synthesizing the month's velocity, key milestones hit, and work completed.
4. achievements: Top 4-6 specific fulfilled items and breakthroughs.
5. unfulfilledItems: Tasks that were left uncompleted or slipped past deadlines, with diagnosis.
6. insightsAndBottlenecks: 2-4 strategic lessons on why certain plans stalled.
7. nextMonthActionPlan: 5-8 concrete, high-impact recommended TODO items for the upcoming month with priority ('high' | 'medium' | 'low') and category.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fulfillmentScore: { type: Type.NUMBER },
              fulfillmentLevel: { type: Type.STRING },
              executiveSummary: { type: Type.STRING },
              achievements: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              unfulfilledItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              insightsAndBottlenecks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              nextMonthActionPlan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['title', 'priority', 'category'],
                },
              },
            },
            required: [
              'fulfillmentScore',
              'fulfillmentLevel',
              'executiveSummary',
              'achievements',
              'unfulfilledItems',
              'insightsAndBottlenecks',
              'nextMonthActionPlan',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    } catch (err: any) {
      console.error('Error in /api/gemini/monthly-report:', err);
      return res.status(500).json({ error: err.message || 'Failed to generate monthly report' });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Workspace server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
