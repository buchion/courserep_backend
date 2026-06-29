import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { TasksService } from './tasks.service';
import { AgentRunRequestDto } from './dto/agent-run.request.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('tasks')
  list(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
  ) {
    return this.tasksService.listTasks(userId, status);
  }

  @Get('tasks/:id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tasksService.getTask(userId, id);
  }

  @Post('agent/run')
  run(@CurrentUser('id') userId: string, @Body() dto: AgentRunRequestDto) {
    return this.tasksService.runAgent(userId, dto);
  }
}
