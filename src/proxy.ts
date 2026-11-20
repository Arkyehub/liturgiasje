import { type NextRequest } from 'next/server'
import { updateSession } from '@/shared/api/supabaseMiddleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Só páginas e rotas de API precisam renovar a sessão. Ficam de fora:
     * - _next/static, _next/image, favicon.ico
     * - sw.js e manifest: o app verifica o service worker a cada 5 min; se isso passar pelo proxy, o servidor
     *   renova o token ao mesmo tempo que o navegador e os dois disputam o mesmo refresh token (a sessão é
     *   invalidada pelo Supabase e o usuário passa a fazer requisições anônimas)
     * - arquivos estáticos por extensão (imagens, scripts, estilos, fontes, mapas, json, txt)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|map|json|txt|woff|woff2)$).*)',
  ],
}
