export interface LiturgyLecture {
  referencia: string
  titulo: string
  texto: string
}

export interface LiturgySalmo {
  referencia: string
  refrao: string
  texto: string
}

export interface LiturgyData {
  data: string
  liturgia: string
  cor: string
  oracoes: {
    coleta?: string
    oferendas?: string
    comunhao?: string
    extras?: { titulo: string; texto: string }[]
  }
  leituras: {
    primeiraLeitura?: LiturgyLecture[]
    salmo?: LiturgySalmo[]
    segundaLeitura?: LiturgyLecture[]
    evangelho?: LiturgyLecture[]
  }
}

export class LiturgyService {
  private static API_URL = "https://liturgia.up.railway.app/v2"

  /**
   * Converte uma string de data formatada em YYYY-MM-DD para objeto com dia, mes e ano formatados.
   */
  private static parseDateString(dateStr: string): { dia: string; mes: string; ano: string } {
    // A data pode vir no formato YYYY-MM-DD
    const parts = dateStr.split("-")
    if (parts.length === 3) {
      return {
        dia: parts[2],
        mes: parts[1],
        ano: parts[0]
      }
    }
    // Fallback básico caso já esteja no formato DD/MM/YYYY ou similar
    const date = new Date(dateStr)
    return {
      dia: String(date.getDate()).padStart(2, '0'),
      mes: String(date.getMonth() + 1).padStart(2, '0'),
      ano: String(date.getFullYear())
    }
  }

  /**
   * Busca a liturgia completa para um determinado dia no formato YYYY-MM-DD
   */
  static async getLiturgyForDate(dateStr: string): Promise<LiturgyData | null> {
    try {
      const { dia, mes, ano } = this.parseDateString(dateStr)
      const url = `${this.API_URL}/?dia=${dia}&mes=${mes}&ano=${ano}`

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Erro ao buscar liturgia: ${response.statusText}`)
      }

      const res = await response.json()
      if (res.erro) {
        console.warn("[LiturgyService]", res.erro)
        return null
      }

      return res as LiturgyData
    } catch (error) {
      console.error("[LiturgyService] Falha na requisição da liturgia:", error)
      return null
    }
  }

  /**
   * Busca apenas a cor litúrgica para uma data (útil para pré-carregamento)
   */
  static async getLiturgyColorForDate(dateStr: string): Promise<string | null> {
    const data = await this.getLiturgyForDate(dateStr)
    return data ? data.cor : null
  }

  /**
   * Remove os números dos versículos do texto das leituras
   */
  static cleanVersesText(text: string): string {
    if (!text) return ""
    // 1. Remove números colados a letras ou aspas (ex: 1No, 24“O, 3Eles)
    let cleaned = text.replace(/\d+(?=[A-Za-zÀ-ÿ“"'])/g, "")
    // 2. Remove números soltos seguidos de espaço no início de linhas ou após pontuação (ex: " 25 Para")
    cleaned = cleaned.replace(/(?<=^|[\.\?\!\;\:]\s+|\n)\d+\s+/g, "")
    return cleaned
  }
}
