import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CourseRepUser {
  id: string;
  email?: string;
  universityId?: string;
  departmentId?: string;
}

@Injectable()
export class CourseRepClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('COURSE_REP_API_URL', 'http://localhost:3000');
    this.secret = config.get<string>('INTERNAL_API_SECRET', '');
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Internal-Secret': this.secret,
    };
  }

  async getUser(userId: string): Promise<CourseRepUser> {
    const res = await fetch(`${this.baseUrl}/internal/users/${userId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Failed to fetch user ${userId}: ${res.status}`);
    return res.json() as Promise<CourseRepUser>;
  }

  async importMaterial(payload: Record<string, unknown>): Promise<{ materialId: string }> {
    const res = await fetch(`${this.baseUrl}/internal/materials/import-from-agent`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Material import failed: ${res.status}`);
    return res.json() as Promise<{ materialId: string }>;
  }

  async createStudyPlanEvent(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/study-plan/events`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Study plan event failed: ${res.status}`);
  }

  async importCourses(
    payload: Record<string, unknown>,
  ): Promise<{ imported: number }> {
    const res = await fetch(`${this.baseUrl}/internal/courses/import-from-agent`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Course import failed: ${res.status}`);
    return res.json() as Promise<{ imported: number }>;
  }

  async updateUniversityPortal(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/universities/portal`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`University portal update failed: ${res.status}`);
  }

  async recomputeStudyPlan(userId: string): Promise<{ jobId?: string }> {
    const res = await fetch(`${this.baseUrl}/internal/study-plan/recompute`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error(`Study plan recompute failed: ${res.status}`);
    return res.json() as Promise<{ jobId?: string }>;
  }

  async createNotification(payload: Record<string, unknown>): Promise<{ notificationId: string }> {
    const res = await fetch(`${this.baseUrl}/internal/notifications`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Notification create failed: ${res.status}`);
    return res.json() as Promise<{ notificationId: string }>;
  }
}
