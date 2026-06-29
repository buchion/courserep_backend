import { Module } from '@nestjs/common';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { PrismaMemoryStore } from './prisma-memory.store';

@Module({
  controllers: [MemoryController],
  providers: [MemoryService, PrismaMemoryStore],
  exports: [PrismaMemoryStore],
})
export class MemoryModule {}
