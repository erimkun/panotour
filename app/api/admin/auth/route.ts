import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('[AUTH] Request received');
    
    const body = await request.json();
    console.log('[AUTH] Body parsed:', { hasPassword: !!body.password });
    
    const { password } = body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    console.log('[AUTH] Env check:', { 
      hasAdminPassword: !!adminPassword,
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('ADMIN'))
    });
    
    if (!adminPassword) {
      console.error('[AUTH] Admin password not configured in environment');
      return NextResponse.json(
        { error: 'Admin şifresi yapılandırılmamış', debug: 'ADMIN_PASSWORD env variable is missing' },
        { status: 500 }
      );
    }
    
    if (password === adminPassword) {
      console.log('[AUTH] Authentication successful');
      return NextResponse.json({ success: true });
    }
    
    console.log('[AUTH] Wrong password');
    return NextResponse.json(
      { error: 'Yanlış şifre' },
      { status: 401 }
    );
  } catch (error) {
    console.error('[AUTH] Error:', error);
    return NextResponse.json(
      { error: 'Sunucu hatası', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

