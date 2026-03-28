import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('health');

export async function GET() {
  const start = performance.now();

  try {
    // Ping Supabase
    const { error } = await supabase.from('settings').select('key').limit(1);
    const durationMs = Math.round(performance.now() - start);

    if (error) {
      log.error('GET /api/health', 'Supabase non raggiungibile', new Error(error.message));
      return NextResponse.json(
        { status: 'unhealthy', supabase: 'down', error: error.message, durationMs },
        { status: 503 },
      );
    }

    log.info('GET /api/health', 'OK', { durationMs });
    return NextResponse.json({
      status: 'healthy',
      supabase: 'ok',
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const e = err instanceof Error ? err : new Error(String(err));
    log.error('GET /api/health', 'Health check fallito', e, { durationMs });

    return NextResponse.json(
      { status: 'unhealthy', error: e.message, durationMs },
      { status: 503 },
    );
  }
}
