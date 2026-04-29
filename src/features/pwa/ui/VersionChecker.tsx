"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/shared/api/supabase"
import { APP_VERSION } from "@/shared/constants/version"
import { Button } from "@/shared/ui/button"
import { RefreshCw, Download } from "lucide-react"

export function VersionChecker() {
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    async function checkVersion() {
      try {
        // Busca configurações do banco (bypass de cache implícito por ser chamada dinâmica)
        const { data, error } = await supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["min_version", "force_update_at"]);

        if (error) throw error;

        const settings = (data || []).reduce((acc, curr) => ({ 
          ...acc, [curr.key]: curr.value 
        }), {} as Record<string, string>);

        const minVersion = settings.min_version;
        const forceUpdateAt = settings.force_update_at;

        // 1. Verificar se a versão atual é diferente da mínima exigida
        if (minVersion && minVersion !== APP_VERSION) {
          setNeedsUpdate(true);
          return;
        }

        // 2. Verificar se existe uma data de atualização forçada
        if (forceUpdateAt) {
          const forceDate = new Date(forceUpdateAt).getTime();
          const lastCheck = localStorage.getItem('last_force_update_check');
          
          // Se nunca checou ou se a data do banco é posterior ao último check bem sucedido
          if (!lastCheck || new Date(lastCheck).getTime() < forceDate) {
            console.log("Detectada data de atualização forçada:", forceUpdateAt);
            
            // Registra o check ANTES de atualizar para evitar loop infinito se algo falhar
            localStorage.setItem('last_force_update_check', new Date().toISOString());
            
            // Só forçamos se o app já estiver aberto há algum tempo ou se for a primeira vez
            handleUpdate(true); 
          }
        }
      } catch (error: any) {
        console.error("Erro ao verificar versão:", error.message || error);
      } finally {
        setIsChecking(false);
      }
    }

    checkVersion();
    
    const interval = setInterval(checkVersion, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdate = async (silent = false) => {
    try {
      // 1. Desregistrar todos os Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }
      
      // 2. Limpar todos os caches da API de Cache
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // 3. Forçar recarregamento ignorando cache do navegador (URL busting)
      // No Safari, redirecionar para a raiz com query param é mais eficaz que reload()
      const clearUrl = window.location.origin + '/?clear=' + Date.now();
      
      if (silent) {
        window.location.replace(clearUrl);
      } else {
        window.location.href = clearUrl;
      }
    } catch (e) {
      window.location.reload();
    }
  }

  if (!needsUpdate) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-[#322113] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        
        {/* Favicon/Logo Centralizado */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all duration-500" />
          <img 
            src="/icons/android-chrome-192x192.png" 
            alt="Logo Liturgia SJE" 
            className="w-24 h-24 relative shadow-2xl rounded-3xl border border-white/10"
          />
        </div>

        <div className="space-y-4">
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase leading-tight">
            Nova Versão<br />Disponível
          </h1>
          <p className="text-stone-400 text-sm font-medium leading-relaxed px-4">
            Uma atualização importante foi liberada para garantir o funcionamento correto das suas escalas.
          </p>
        </div>

        <div className="w-full pt-4">
          <Button 
            onClick={() => handleUpdate()}
            variant="default" 
            className="w-full h-14 bg-white text-[#322113] hover:bg-stone-100 font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-black/20 group transition-all"
          >
            <RefreshCw className="mr-2 h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
            Atualizar Agora
          </Button>
          <span className="mt-4 block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
            Patch v{APP_VERSION}
          </span>
        </div>

      </div>
    </div>
  )
}
