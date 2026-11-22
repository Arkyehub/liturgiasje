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
import { LogOut, User, Users, UserCircle, Download, ArrowLeft, BarChart3, Cake } from "lucide-react"
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

const menuItemClass =
  "flex min-h-12 cursor-pointer items-center rounded-2xl px-2 py-2 text-[15px] font-bold text-[#241A10] focus:bg-[#FBF1D2] focus:text-[#241A10]"
const menuIconClass = "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F4EEDD] text-[#322113]"

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
    <header className="sticky top-0 z-50 w-full bg-[#322113]">
      <div className="container relative flex h-[68px] items-center justify-between px-4 max-w-md mx-auto">
        {/* Botão Voltar (Opcional) */}
        {showBackButton && (
          <button
            onClick={() => window.history.back()}
            className="absolute left-4 z-10 p-2 rounded-full hover:bg-white/10 transition-colors active:scale-95"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-6 w-6 text-[#E8C76A]" />
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
              src="/Logo-Liturgia-SJE-header.png?v=2"
              alt="Logo Liturgia SJE"
              className={`${centerLogo ? 'h-9 w-9' : 'h-11 w-11'} rounded-xl`}
            />
            <div className={`flex flex-col ${centerLogo ? 'items-start' : ''}`}>
              <h1 className={`${centerLogo ? 'text-base' : 'text-[19px]'} font-black tracking-tight text-[#E8C76A] leading-none`}>
                Liturgia SJE
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#E9DFCB]">
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
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-[#F4EEDD] font-bold text-[9px] uppercase tracking-widest px-3 py-2 rounded-xl border border-white/20 shadow-sm transition-all active:scale-95 animate-in fade-in zoom-in duration-500"
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
                    <svg viewBox="0 0 100 100" className="absolute -top-[16px] left-0 z-10 w-10 h-10 -rotate-[15deg] drop-shadow-[0_2px_3px_rgba(0,0,0,0.15)] pointer-events-none">
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
                  <Avatar className="h-12 w-12 cursor-pointer border-2 border-[#E8B21E] transition-colors hover:border-[#d8a516]">
                    <AvatarImage src={user?.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-stone-100 text-stone-600">
                      <UserCircle className="h-7 w-7" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-[17rem] rounded-[22px] border border-[#E9DFCB] bg-[#FFFDF8] p-2 shadow-[0_12px_32px_rgba(50,33,19,0.18)] ring-0"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 pb-3 pt-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 border-2 border-[#E8B21E]">
                        <AvatarImage src={user?.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-stone-100 text-stone-600">
                          <UserCircle className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <span className="max-w-full truncate text-[16px] font-extrabold leading-tight text-[#241A10]">{user?.fullName || "Usuário"}</span>
                        <span className="rounded-full bg-[#FDF1D6] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#7A4F00]">
                          {user?.role === "admin" ? "Administrador" : "Leitor"}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="mx-1 my-1 bg-[#EFE6D2]" />
                <DropdownMenuItem
                  className={menuItemClass}
                  render={
                    <Link href="/perfil" className="flex w-full items-center gap-3">
                      <span className={menuIconClass}><User className="h-[18px] w-[18px]" /></span>
                      <span>Meu Perfil</span>
                    </Link>
                  }
                />
                <DropdownMenuItem
                  className={menuItemClass}
                  render={
                    <Link href="/aniversarios" className="flex w-full items-center gap-3">
                      <span className={menuIconClass}><Cake className="h-[18px] w-[18px]" /></span>
                      <span>Lista de Aniversários</span>
                    </Link>
                  }
                />

                {user?.role === "admin" && (
                  <>
                    <DropdownMenuSeparator className="mx-1 my-1 bg-[#EFE6D2]" />
                    <DropdownMenuItem
                      className={menuItemClass}
                      render={
                        <Link href="/admin/membros" className="flex w-full items-center gap-3">
                          <span className={menuIconClass}><Users className="h-[18px] w-[18px]" /></span>
                          <span>Gestão de Membros</span>
                        </Link>
                      }
                    />
                    <DropdownMenuItem
                      className={menuItemClass}
                      render={
                        <Link href="/admin/analise" className="flex w-full items-center gap-3">
                          <span className={menuIconClass}><BarChart3 className="h-[18px] w-[18px]" /></span>
                          <span>Análise de Usuários</span>
                        </Link>
                      }
                    />
                  </>
                )}

                <DropdownMenuSeparator className="mx-1 my-1 bg-[#EFE6D2]" />
                <DropdownMenuItem
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold text-[#A23F06] focus:bg-[#FDEBDD] focus:text-[#A23F06]"
                  onClick={() => onSignOut?.()}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FDEBDD] text-[#A23F06]">
                    <LogOut className="h-[18px] w-[18px]" />
                  </span>
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
                  <svg viewBox="0 0 100 100" className="absolute -top-[16px] left-0 z-10 w-10 h-10 -rotate-[15deg] drop-shadow-[0_2px_3px_rgba(0,0,0,0.15)] pointer-events-none">
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
                <Avatar className="h-12 w-12 cursor-pointer border-2 border-[#E8B21E] transition-colors hover:border-[#d8a516]">
                  <AvatarFallback className="bg-stone-100 text-stone-600">
                    <UserCircle className="h-7 w-7" />
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
