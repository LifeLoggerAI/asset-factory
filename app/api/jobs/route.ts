import { NextRequest, NextResponse } from 'next/server'

const ENGINE_URL = process.env.ENGINE_URL || 'http://127.0.0.1:5050'
const API_KEY = process.env.ASSET_FACTORY_API_KEY

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const engineResponse = await fetch(`${ENGINE_URL}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    const data = await engineResponse.json()

    return NextResponse.json(data, {
      status: engineResponse.status,
    })

  } catch (error: any) {
    console.error('Proxy error:', error)
    return NextResponse.json(
      { error: 'Engine connection failed' },
      { status: 500 }
    )
  }
}
