import { Global, Module } from '@nestjs/common';
import { CourseRepClient } from './course-rep.client';

@Global()
@Module({
  providers: [CourseRepClient],
  exports: [CourseRepClient],
})
export class CourseRepModule {}
