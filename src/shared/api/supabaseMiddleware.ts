import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const NON_SESSION_DESTINATIONS = new Set(['serviceworker', 'sharedworker', 'worker', 'script', 'style', 'image', 'font', 'manifest', 'audio', 'video', 'track'])

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Pré-carregamentos do Next (<Link> visíveis na tela) não precisam renovar a sessão e eram uma
  // das maiores fontes de chamadas ao Auth do Supabase.
  if (request.headers.get('next-router-prefetch') || request.headers.get('purpose') === 'prefetch') {
    return supabaseResponse
  }

  // Defesa extra além do matcher: pedidos de arquivos (service worker, manifest, scripts, imagens...) nunca
  // devem renovar o token no servidor. Só navegações e chamadas de dados.
  const fetchDest = request.headers.get('sec-fetch-dest')
  if (fetchDest && NON_SESSION_DESTINATIONS.has(fetchDest)) {
    return supabaseResponse
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Atualiza a sessão
    await supabase.auth.getUser()
  } catch (error) {
    console.error("Erro no middleware do Supabase:", error)
  }

  return supabaseResponse
}
