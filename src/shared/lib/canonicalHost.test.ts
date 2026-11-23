import { canonicalRedirectUrl } from './canonicalHost'

describe('canonicalRedirectUrl', () => {
  it('redireciona domínio alternativo em production, preservando caminho e query', () => {
    expect(canonicalRedirectUrl('production', 'liturgiasje-leonardo-vitorinos-projects.vercel.app', '/escalas?x=1'))
      .toBe('https://liturgiasje.vercel.app/escalas?x=1')
  })
  it('não redireciona o domínio oficial', () => {
    expect(canonicalRedirectUrl('production', 'liturgiasje.vercel.app', '/')).toBeNull()
    expect(canonicalRedirectUrl('production', 'LITURGIASJE.vercel.app', '/')).toBeNull()
  })
  it('não redireciona em preview, development ou sem ambiente', () => {
    expect(canonicalRedirectUrl('preview', 'x-git-preview.vercel.app', '/')).toBeNull()
    expect(canonicalRedirectUrl('development', 'localhost:3000', '/')).toBeNull()
    expect(canonicalRedirectUrl(undefined, 'localhost:3000', '/')).toBeNull()
  })
  it('não gera redirecionamento aberto com caminho malformado', () => {
    expect(canonicalRedirectUrl('production', 'outro.app', '//evil.com')).toBe('https://liturgiasje.vercel.app/')
  })
})
