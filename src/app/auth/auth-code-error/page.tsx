import Link from "next/link"
import { ShieldAlert } from "lucide-react"

export const metadata = { title: "Não foi possível entrar - Liturgia SJE" }

export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <ShieldAlert className="h-10 w-10 text-stone-300" aria-hidden="true" />
      <div className="max-w-xs space-y-1.5">
        <h1 className="text-xl font-black tracking-tight text-stone-800">Não foi possível entrar</h1>
        <p className="text-sm text-stone-500">
          O link de acesso expirou ou já foi usado. Volte para o início e entre novamente com o Google.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-800 px-6 text-sm font-bold text-white hover:bg-black"
      >
        Voltar para o início
      </Link>
    </main>
  )
}
