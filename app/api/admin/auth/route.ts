import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      return NextResponse.json(
        { error: 'Admin şifresi yapılandırılmamış' },
        { status: 500 }
      );
    }
    
    if (password === adminPassword) {
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json(
      { error: 'Yanlış şifre' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Sunucu hatası' },
      { status: 500 }
    );
  }
}

