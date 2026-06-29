import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConnectService } from './connect.service';
import { ConnectLmsRequestDto, ReconnectRequestDto } from './dto/connect-lms.request.dto';

@ApiTags('connect')
@ApiBearerAuth()
@Controller()
export class ConnectController {
  constructor(private readonly connectService: ConnectService) {}

  @Post('connect-lms')
  connectLms(@CurrentUser('id') userId: string, @Body() dto: ConnectLmsRequestDto) {
    return this.connectService.connectLms(userId, dto);
  }

  @Get('connected-accounts')
  list(@CurrentUser('id') userId: string) {
    return this.connectService.listAccounts(userId);
  }

  @Post('reconnect')
  reconnect(@CurrentUser('id') userId: string, @Body() dto: ReconnectRequestDto) {
    return this.connectService.reconnect(userId, dto.connectedAccountId);
  }

  @Delete('connected-accounts/:id')
  revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.connectService.revoke(userId, id);
  }
}
