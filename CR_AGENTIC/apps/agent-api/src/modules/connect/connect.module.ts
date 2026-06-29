import { Module } from '@nestjs/common';
import { ConnectController } from './connect.controller';
import { ConnectService } from './connect.service';

@Module({
  controllers: [ConnectController],
  providers: [ConnectService],
})
export class ConnectModule {}
