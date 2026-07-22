"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { LogOut, User, LayoutDashboard, Users, UserCircle, Download, ArrowLeft, BarChart3 } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"

interface HeaderProps {
  user?: {
    fullName?: string
    avatarUrl?: string | null
    role?: "admin" | "reader"
  } | null
  onSignIn?: () => void
  onSignOut?: () => void
  showBackButton?: boolean
  centerLogo?: boolean
}

export function Header({
  user,
  onSignIn,
  onSignOut,
  showBackButton = false,
  centerLogo = false
}: HeaderProps) {
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Verificar se o prompt de instalação já está disponível
    if (typeof window !== 'undefined' && window.deferredPrompt) {
      setIsInstallable(true);
    }

    const handleInstallable = () => setIsInstallable(true);
    const handleInstalled = () => setIsInstallable(false);

    window.addEventListener('pwa-installable', handleInstallable);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) return;

    // Mostrar o prompt nativo
    promptEvent.prompt();

    // Esperar pela escolha do usuário
    const { outcome } = await promptEvent.userChoice;
    console.log(`PWA: Usuário escolheu ${outcome}`);

    // Limpar o prompt
    window.deferredPrompt = null;
    setIsInstallable(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container relative flex h-20 items-center justify-between px-4 max-w-md mx-auto">
        {/* Botão Voltar (Opcional) */}
        {showBackButton && (
          <button
            onClick={() => window.history.back()}
            className="absolute left-4 z-10 p-2 rounded-full hover:bg-stone-100 transition-colors active:scale-95"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-6 w-6 text-stone-600" />
          </button>
        )}

        {/* Logo e Título (Centralizado se centerLogo for true) */}
        <div className={`flex items-center gap-2 ${centerLogo
            ? 'absolute left-1/2 -translate-x-1/2'
            : 'flex-1'
          }`}>
          <Link
            key={centerLogo ? 'centered' : 'left'}
            href="/"
            className="flex items-center gap-2 transition-transform active:scale-95 group animate-in fade-in duration-500"
            onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <img
              src="/Logo-Liturgia-SJE.png"
              alt="Logo Liturgia SJE"
              className={`${centerLogo ? 'h-10 w-auto' : 'h-14 w-auto'} drop-shadow-sm group-hover:drop-shadow-md transition-all`}
            />
            <div className={`flex flex-col ${centerLogo ? 'items-start' : ''}`}>
              <h1 className={`${centerLogo ? 'text-lg' : 'text-xl'} font-black tracking-tight text-stone-800 leading-none`}>
                Liturgia SJE
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Painel do Leitor
              </span>
            </div>
          </Link>
        </div>

        {/* Botão de Instalação (PWA) - Escondido se logo centralizado para evitar poluição */}
        {isInstallable && !centerLogo && (
          <div className="flex-1 flex justify-center ml-2 mr-12">
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[9px] uppercase tracking-widest px-3 py-2 rounded-xl border border-stone-200 shadow-sm transition-all active:scale-95 animate-in fade-in zoom-in duration-500"
            >
              <Download className="h-3 w-3" />
              Baixar App
            </button>
          </div>
        )}

        {/* Perfil/Login à Direita */}
        <div className="absolute right-4 flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="focus:outline-none">
                <div className="relative">
                  {/* Chapéu de Palha Junino condicional */}
                  {new Date().getMonth() === 5 && (
                    <svg viewBox="0 0 100 100" className="absolute -top-[18px] left-[2px] z-10 w-11 h-11 -rotate-[15deg] drop-shadow-[0_2px_3px_rgba(0,0,0,0.15)] pointer-events-none">
                      {/* Copa do chapéu */}
                      <path d="M 30 50 Q 30 20 50 20 Q 70 20 70 50" fill="#e5c158" stroke="#b69324" strokeWidth="2.5" />
                      {/* Faixinha vermelha */}
                      <path d="M 29 48 Q 29 42 50 42 Q 71 42 71 48" fill="#e23a3a" />
                      {/* Aba do chapéu */}
                      <ellipse cx="50" cy="53" rx="40" ry="12" fill="#f0d37d" stroke="#b69324" strokeWidth="2.5" />
                      {/* Detalhes de palha desfiada */}
                      <line x1="12" y1="53" x2="8" y2="52" stroke="#b69324" strokeWidth="2.5" />
                      <line x1="88" y1="53" x2="92" y2="54" stroke="#b69324" strokeWidth="2.5" />
                      <line x1="20" y1="60" x2="18" y2="64" stroke="#b69324" strokeWidth="2.5" />
                      <line x1="80" y1="60" x2="82" y2="64" stroke="#b69324" strokeWidth="2.5" />
                      <line x1="50" y1="65" x2="50" y2="68" stroke="#b69324" strokeWidth="2.5" />
                      {/* Remendo decorativo */}
                      <path d="M 42 30 L 48 30 L 48 36 L 42 36 Z" fill="#4d94ff" opacity="0.9" />
                      <line x1="40" y1="33" x2="50" y2="33" stroke="#fff" strokeWidth="1" />
                      <line x1="45" y1="28" x2="45" y2="38" stroke="#fff" strokeWidth="1" />
                    </svg>
                  )}
                  <Avatar className="h-14 w-14 cursor-pointer border-2 border-stone-200 transition-colors hover:border-stone-300">
                    <AvatarImage src={user?.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-stone-100 text-stone-600">
                      <UserCircle className="h-9 w-9" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="truncate">{user?.fullName || "Usuário"}</span>
                      <span className="text-xs font-normal text-stone-500 capitalize">
                        {user?.role === "admin" ? "Administrador" : "Leitor"}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={
                    <Link href="/perfil" className="flex items-center w-full">
                      <User className="mr-2 h-4 w-4" />
                      <span>Meu Perfil</span>
                    </Link>
                  }
                />

                {user?.role === "admin" && (
                  <>
                    <DropdownMenuItem
                      render={
                        <Link href="/admin/membros" className="flex items-center w-full">
                          <Users className="mr-2 h-4 w-4" />
                          <span>Gestão de Membros</span>
                        </Link>
                      }
                    />
                    <DropdownMenuItem
                      render={
                        <Link href="/admin/analise" className="flex items-center w-full">
                          <BarChart3 className="mr-2 h-4 w-4" />
                          <span>Análise de Usuários</span>
                        </Link>
                      }
                    />
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onSignOut?.()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              onClick={() => onSignIn?.()}
              className="focus:outline-none transition-transform active:scale-95"
              aria-label="Fazer login com Google"
            >
              <div className="relative">
                {/* Chapéu de Palha Junino condicional */}
                {new Date().getMonth() === 5 && (
                  <svg viewBox="0 0 100 100" className="absolute -top-[18px] left-[2px] z-10 w-11 h-11 -rotate-[15deg] drop-shadow-[0_2px_3px_rgba(0,0,0,0.15)] pointer-events-none">
                    {/* Copa do chapéu */}
                    <path d="M 30 50 Q 30 20 50 20 Q 70 20 70 50" fill="#e5c158" stroke="#b69324" strokeWidth="2.5" />
                    {/* Faixinha vermelha */}
                    <path d="M 29 48 Q 29 42 50 42 Q 71 42 71 48" fill="#e23a3a" />
                    {/* Aba do chapéu */}
                    <ellipse cx="50" cy="53" rx="40" ry="12" fill="#f0d37d" stroke="#b69324" strokeWidth="2.5" />
                    {/* Detalhes de palha desfiada */}
                    <line x1="12" y1="53" x2="8" y2="52" stroke="#b69324" strokeWidth="2.5" />
                    <line x1="88" y1="53" x2="92" y2="54" stroke="#b69324" strokeWidth="2.5" />
                    <line x1="20" y1="60" x2="18" y2="64" stroke="#b69324" strokeWidth="2.5" />
                    <line x1="80" y1="60" x2="82" y2="64" stroke="#b69324" strokeWidth="2.5" />
                    <line x1="50" y1="65" x2="50" y2="68" stroke="#b69324" strokeWidth="2.5" />
                    {/* Remendo decorativo */}
                    <path d="M 42 30 L 48 30 L 48 36 L 42 36 Z" fill="#4d94ff" opacity="0.9" />
                    <line x1="40" y1="33" x2="50" y2="33" stroke="#fff" strokeWidth="1" />
                    <line x1="45" y1="28" x2="45" y2="38" stroke="#fff" strokeWidth="1" />
                  </svg>
                )}
                <Avatar className="h-14 w-14 cursor-pointer border-2 border-stone-200 transition-colors hover:border-stone-300">
                  <AvatarFallback className="bg-stone-100 text-stone-600">
                    <UserCircle className="h-9 w-9" />
                  </AvatarFallback>
                </Avatar>
              </div>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
