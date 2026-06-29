import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemoryCategory } from '@cr-agentic/database';
import { CurrentUser } from '../auth/current-user.decorator';
import { MemoryService } from './memory.service';

@ApiTags('memory')
@ApiBearerAuth()
@Controller()
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get('memory')
  list(
    @CurrentUser('id') userId: string,
    @Query('category') category?: MemoryCategory,
  ) {
    return this.memoryService.list(userId, category);
  }

  @Patch('memory/preferences')
  updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.memoryService.updatePreferences(userId, body);
  }
}
