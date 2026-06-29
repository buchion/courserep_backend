import { ToolRegistry, ToolContext } from '@cr-agentic/agent-core';
import { LlmProvider } from '../llm/llm-provider';
import { DocumentProcessor } from '../document/document-processor';
import { S3StorageClient } from '@cr-agentic/storage';
import { prisma } from '@cr-agentic/database';

export function registerAiTools(
  registry: ToolRegistry,
  llm: LlmProvider,
  docProcessor: DocumentProcessor,
  s3: S3StorageClient,
) {
  registry.register({
    name: 'extract_text',
    description: 'Extract text from a stored document',
    inputSchema: { type: 'object', properties: { documentId: { type: 'string' } } },
    timeoutMs: 120_000,
    maxConcurrency: 10,
    handler: async (ctx: ToolContext, input: unknown) => {
      const data = input as { documentId: string };
      const doc = await prisma.agentDocument.findUnique({
        where: { id: data.documentId ?? ctx.documentId },
      });
      if (!doc) throw new Error('Document not found');
      const buffer = await s3.download(doc.s3Key);
      const extracted = await docProcessor.extract(buffer, doc.mimeType ?? undefined);
      await prisma.agentDocument.update({
        where: { id: doc.id },
        data: {
          extractedMetadata: extracted.metadata as object,
          pageCount: extracted.pageCount,
          processingStatus: 'EXTRACTING',
        },
      });
      return extracted;
    },
  });

  registry.register({
    name: 'summarize',
    description: 'Summarize document text',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string' }, text: { type: 'string' } },
    },
    timeoutMs: 120_000,
    maxConcurrency: 15,
    handler: async (ctx: ToolContext, input: unknown) => {
      const data = input as { documentId: string; text: string };
      const result = await llm.complete([
        {
          role: 'system',
          content: 'Summarize the lecture material for a university student. Be concise but complete.',
        },
        { role: 'user', content: data.text.slice(0, 24_000) },
      ]);

      await prisma.summary.upsert({
        where: { documentId: data.documentId },
        create: {
          documentId: data.documentId,
          content: result.content,
          model: result.model,
          tokenUsage: result.tokenUsage as object | undefined,
        },
        update: {
          content: result.content,
          model: result.model,
          tokenUsage: result.tokenUsage as object | undefined,
        },
      });

      return { summary: result.content, model: result.model };
    },
  });

  registry.register({
    name: 'create_flashcards',
    description: 'Generate flashcards from document text',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string' }, text: { type: 'string' } },
    },
    timeoutMs: 120_000,
    maxConcurrency: 15,
    handler: async (ctx: ToolContext, input: unknown) => {
      const data = input as { documentId: string; text: string };
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'Generate 5 flashcards as JSON: {"flashcards":[{"question":"","answer":"","explanation":"","topic":"","difficulty":"easy|medium|hard"}]}',
          },
          { role: 'user', content: data.text.slice(0, 20_000) },
        ],
        { json: true },
      );

      const parsed = JSON.parse(result.content) as {
        flashcards: Array<{
          question: string;
          answer: string;
          explanation?: string;
          topic?: string;
          difficulty?: string;
        }>;
      };

      await prisma.agentFlashcard.deleteMany({ where: { documentId: data.documentId } });
      for (const card of parsed.flashcards ?? []) {
        await prisma.agentFlashcard.create({
          data: {
            documentId: data.documentId,
            question: card.question,
            answer: card.answer,
            explanation: card.explanation,
            topic: card.topic,
            difficulty: card.difficulty,
          },
        });
      }

      return { count: parsed.flashcards?.length ?? 0 };
    },
  });

  registry.register({
    name: 'generate_quiz',
    description: 'Generate quiz questions from document text',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string' }, text: { type: 'string' } },
    },
    timeoutMs: 120_000,
    maxConcurrency: 10,
    handler: async (ctx: ToolContext, input: unknown) => {
      const data = input as { documentId: string; text: string };
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'Generate 5 multiple-choice questions as JSON: {"questions":[{"question":"","options":["A","B","C","D"],"correctIndex":0,"explanation":""}]}',
          },
          { role: 'user', content: data.text.slice(0, 20_000) },
        ],
        { json: true },
      );

      const parsed = JSON.parse(result.content) as { questions: unknown[] };

      await prisma.agentQuiz.deleteMany({ where: { documentId: data.documentId } });
      await prisma.agentQuiz.create({
        data: {
          documentId: data.documentId,
          questions: parsed.questions as object,
          model: result.model,
        },
      });

      return { count: parsed.questions?.length ?? 0 };
    },
  });
}
