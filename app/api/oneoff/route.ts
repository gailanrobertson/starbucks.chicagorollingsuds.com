import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllOneOffJobs, addOneOffJob } from '@/lib/db';
import { OneOffJob } from '@/lib/types';

export async function GET() {
  try {
    return NextResponse.json(await getAllOneOffJobs());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const now = new Date().toISOString();
    const job: OneOffJob = {
      lineItems: [],
      status: 'scheduled',
      ...body,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    if (!job.brand || !job.woNumber) {
      return NextResponse.json({ error: 'brand and woNumber are required' }, { status: 400 });
    }
    await addOneOffJob(job);
    return NextResponse.json({ success: true, job });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
