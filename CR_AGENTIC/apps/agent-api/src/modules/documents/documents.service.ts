import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@cr-agentic/database';

@Injectable()
export class DocumentsService {
  async listDocuments(userId: string) {
    const accounts = await prisma.connectedAccount.findMany({
      where: { userId },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    return prisma.agentDocument.findMany({
      where: {
        lectureMaterial: { connectedAccountId: { in: accountIds } },
      },
      include: {
        lectureMaterial: true,
        summary: true,
        flashcards: { take: 5 },
        quizzes: { take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getDocumentSummary(userId: string, documentId: string) {
    const doc = await prisma.agentDocument.findFirst({
      where: {
        id: documentId,
        lectureMaterial: { connectedAccount: { userId } },
      },
      include: { summary: true, flashcards: true, quizzes: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}
