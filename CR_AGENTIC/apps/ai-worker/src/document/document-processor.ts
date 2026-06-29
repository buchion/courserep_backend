import pdfParse from 'pdf-parse';

export interface ExtractedDocument {
  text: string;
  pageCount?: number;
  metadata: Record<string, unknown>;
}

export class DocumentProcessor {
  async extract(buffer: Buffer, mimeType?: string): Promise<ExtractedDocument> {
    if (mimeType?.includes('pdf') || this.looksLikePdf(buffer)) {
      const parsed = await pdfParse(buffer);
      return {
        text: parsed.text,
        pageCount: parsed.numpages,
        metadata: { info: parsed.info, mimeType: 'application/pdf' },
      };
    }

    const text = buffer.toString('utf8');
    return {
      text,
      metadata: { mimeType: mimeType ?? 'text/plain' },
    };
  }

  private looksLikePdf(buffer: Buffer): boolean {
    return buffer.subarray(0, 4).toString() === '%PDF';
  }

  chunkText(text: string, maxChars = 12_000): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars));
    }
    return chunks.length ? chunks : [''];
  }
}
