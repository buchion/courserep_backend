import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectModule } from './modules/connect/connect.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MemoryModule } from './modules/memory/memory.module';
import { EventsModule } from './modules/events/events.module';
import { QueueModule } from './modules/queue/queue.module';
import { CourseRepModule } from './integrations/course-rep/course-rep.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    QueueModule,
    CourseRepModule,
    AuthModule,
    HealthModule,
    ConnectModule,
    OnboardingModule,
    TasksModule,
    DocumentsModule,
    NotificationsModule,
    MemoryModule,
    EventsModule,
  ],
})
export class AppModule {}
