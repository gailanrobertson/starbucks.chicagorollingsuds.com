import { createClient, RedisClientType } from 'redis';
import fs from 'fs';
import path from 'path';
import { Job, OneOffJob } from './types';

const REDIS_URL = process.env.REDIS_URL || '';
const useRedis = !!REDIS_URL;

let redisClient: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({ url: REDIS_URL }) as RedisClientType;
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
  }
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

const JOBS_KEY = 'starbucks:jobs';
const TECHS_KEY = 'starbucks:technicians';
const DATA_DIR = path.join(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const TECHS_FILE = path.join(DATA_DIR, 'technicians.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Jobs ───

export async function getAllJobs(): Promise<Job[]> {
  if (useRedis) {
    try {
      const client = await getRedis();
      const data = await client.get(JOBS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Redis getAllJobs error:', err);
      return [];
    }
  }
  ensureDir();
  try {
    if (!fs.existsSync(JOBS_FILE)) return [];
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function setAllJobs(jobs: Job[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    await client.set(JOBS_KEY, JSON.stringify(jobs));
    return;
  }
  ensureDir();
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

export async function getJobById(id: string): Promise<Job | null> {
  const jobs = await getAllJobs();
  return jobs.find((j) => j.id === id) || null;
}

export async function addJobs(newJobs: Job | Job[]): Promise<number> {
  const jobs = await getAllJobs();
  const toAdd = Array.isArray(newJobs) ? newJobs : [newJobs];
  jobs.push(...toAdd);
  await setAllJobs(jobs);
  return toAdd.length;
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<Job | null> {
  const jobs = await getAllJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...updates, updatedAt: new Date().toISOString() };
  await setAllJobs(jobs);
  return jobs[idx];
}

export async function deleteJob(id: string): Promise<void> {
  const jobs = await getAllJobs();
  await setAllJobs(jobs.filter((j) => j.id !== id));
}

// ─── One-Off Jobs ───

const ONEOFF_KEY = 'starbucks:oneoff-jobs';
const ONEOFF_FILE = path.join(DATA_DIR, 'oneoff-jobs.json');

export async function getAllOneOffJobs(): Promise<OneOffJob[]> {
  if (useRedis) {
    try {
      const client = await getRedis();
      const data = await client.get(ONEOFF_KEY);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Redis getAllOneOffJobs error:', err);
      return [];
    }
  }
  ensureDir();
  try {
    if (!fs.existsSync(ONEOFF_FILE)) return [];
    return JSON.parse(fs.readFileSync(ONEOFF_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function setAllOneOffJobs(jobs: OneOffJob[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    await client.set(ONEOFF_KEY, JSON.stringify(jobs));
    return;
  }
  ensureDir();
  fs.writeFileSync(ONEOFF_FILE, JSON.stringify(jobs, null, 2));
}

export async function getOneOffJobById(id: string): Promise<OneOffJob | null> {
  const jobs = await getAllOneOffJobs();
  return jobs.find((j) => j.id === id) || null;
}

export async function addOneOffJob(job: OneOffJob): Promise<void> {
  const jobs = await getAllOneOffJobs();
  jobs.push(job);
  await setAllOneOffJobs(jobs);
}

export async function updateOneOffJob(id: string, updates: Partial<OneOffJob>): Promise<OneOffJob | null> {
  const jobs = await getAllOneOffJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...updates, updatedAt: new Date().toISOString() };
  await setAllOneOffJobs(jobs);
  return jobs[idx];
}

export async function deleteOneOffJob(id: string): Promise<void> {
  const jobs = await getAllOneOffJobs();
  await setAllOneOffJobs(jobs.filter((j) => j.id !== id));
}

// ─── Keepalive ───

const KEEPALIVE_KEY = 'starbucks:keepalive';

// Redis Cloud free tier deletes databases with no write activity;
// a daily timestamp write keeps it alive.
export async function touchKeepalive(): Promise<string> {
  const now = new Date().toISOString();
  if (useRedis) {
    const client = await getRedis();
    await client.set(KEEPALIVE_KEY, now);
  }
  return now;
}

// ─── Technicians ───

const DEFAULT_TECHS = ['Max Gelfman', 'Alexander Cardone', 'Alejandro Claudio', 'Jovens Toussaint'];

export async function getTechnicians(): Promise<string[]> {
  if (useRedis) {
    try {
      const client = await getRedis();
      const data = await client.get(TECHS_KEY);
      return data ? JSON.parse(data) : DEFAULT_TECHS;
    } catch (err) {
      console.error('Redis getTechnicians error:', err);
      return DEFAULT_TECHS;
    }
  }
  ensureDir();
  try {
    if (!fs.existsSync(TECHS_FILE)) return DEFAULT_TECHS;
    return JSON.parse(fs.readFileSync(TECHS_FILE, 'utf-8'));
  } catch {
    return DEFAULT_TECHS;
  }
}

export async function setTechnicians(techs: string[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    await client.set(TECHS_KEY, JSON.stringify(techs));
    return;
  }
  ensureDir();
  fs.writeFileSync(TECHS_FILE, JSON.stringify(techs, null, 2));
}
