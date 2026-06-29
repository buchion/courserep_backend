import { prisma } from '@cr-agentic/database';
import { AgentEventType } from '@cr-agentic/shared';
import { ToolRegistry } from '@cr-agentic/agent-core';
import { S3StorageClient } from '@cr-agentic/storage';
import { DocumentProcessor } from '../document/document-processor';
import { CourseRepClient } from '../integrations/course-rep.client';

export class AiPipeline {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly s3: S3StorageClient,
    private readonly docProcessor: DocumentProcessor,
    private readonly courseRep: CourseRepClient,
  ) {}

  async processDocument(documentId: string, userId: string, connectedAccountId: string) {
    const doc = await prisma.agentDocument.findUnique({
      where: { id: documentId },
      include: { lectureMaterial: true },
    });
    if (!doc) throw new Error('Document not found');

    await prisma.agentDocument.update({
      where: { id: doc.id },
      data: { processingStatus: 'PROCESSING' },
    });

    const ctx = { userId, documentId, connectedAccountId };

    const extracted = await this.registry.execute<{ documentId: string }, { text: string }>(
      'extract_text',
      ctx,
      { documentId },
    );

    await this.registry.execute('summarize', ctx, {
      documentId,
      text: extracted.text,
    });

    await this.registry.execute('create_flashcards', ctx, {
      documentId,
      text: extracted.text,
    });

    await this.registry.execute('generate_quiz', ctx, {
      documentId,
      text: extracted.text,
    });

    const summary = await prisma.summary.findUnique({ where: { documentId } });

    const importResult = await this.courseRep.importMaterial({
      userId,
      title: doc.lectureMaterial.title,
      fileUrl: doc.s3Key,
      summary: summary?.content,
      mimeType: doc.mimeType,
      source: 'agent',
      agentDocumentId: doc.id,
    });

    await prisma.agentDocument.update({
      where: { id: doc.id },
      data: {
        processingStatus: 'COMPLETED',
        mainMaterialId: importResult.materialId,
      },
    });

    await this.courseRep.recomputeStudyPlan(userId);

    await prisma.outboxEvent.create({
      data: {
        eventType: AgentEventType.DOCUMENT_PROCESSED,
        aggregateId: doc.id,
        payload: {
          userId,
          documentId: doc.id,
          title: doc.lectureMaterial.title,
          mainMaterialId: importResult.materialId,
        },
      },
    });

    return { documentId, mainMaterialId: importResult.materialId };
  }
}
