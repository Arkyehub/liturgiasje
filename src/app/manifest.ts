import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Liturgia SJE - Painel do Leitor',
    short_name: 'Liturgia SJE',
    description: 'Sistema de gestão de escalas e comunicação para o ministério de leitores.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#322113',
    theme_color: '#322113',
    categories: ['utilities', 'lifestyle'],
    icons: [
      {
        src: '/icons/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

