"use client"

import { Badge } from "@/shared/ui/badge"

/** Tag resumida do estado da missa no planejamento, no mesmo estilo das tags da tela de Escala. */
export function MassStatusTag({ kind }: { kind: "published" | "draft" }) {
  const published = kind === "published"
  return (
    <Badge
      variant="outline"
      title={published ? "Publicada" : "Em rascunho"}
      className={`h-5 shrink-0 px-2 py-0 text-[9px] font-black ${
        published ? "border-green-200 bg-green-50 text-green-600" : "border-orange-200 bg-orange-50 text-orange-600"
      }`}
    >
      <span aria-hidden="true">{published ? "PUBL" : "RASC"}</span>
      <span className="sr-only">{published ? "Publicada" : "Em rascunho"}</span>
    </Badge>
  )
}

/** Fundo bem leve da linha, combinando com a tag. */
export const MASS_ROW_TINT = { published: "bg-green-50", draft: "bg-orange-50" } as const
