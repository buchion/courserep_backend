import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('documents')
  list(@CurrentUser('id') userId: string) {
    return this.documentsService.listDocuments(userId);
  }

  @Get('documents/:id/summary')
  summary(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.documentsService.getDocumentSummary(userId, id);
  }
}
