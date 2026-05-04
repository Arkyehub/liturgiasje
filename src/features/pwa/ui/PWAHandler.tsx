"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { useAuth } from "@/shared/hooks/useAuth"
import { APP_VERSION } from "@/shared/constants/version"

declare global {
  interface Window {
    deferredPrompt: any;
  }
}

export function PWAHandler() {
  const { user } = useAuth()

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      
      // 1. Recarregar a página quando um novo Service Worker assume o controle
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Só recarrega se já houver um controller (indicando uma atualização de versão)
        // Se for a primeira vez que o SW assume (página limpa), não precisamos recarregar
        if (refreshing || !navigator.serviceWorker.controller) return;
        refreshing = true;
        window.location.reload();
      });

      const subscribeToNotifications = async (registration: ServiceWorkerRegistration) => {
        try {
          // Só tenta subscrever se houver um usuário autenticado
          if (!user) return;

          // 1. Verificar se notificações são suportadas
          if (!('Notification' in window)) return;

          // 2. Se a permissão for negada, não faz nada
          if (Notification.permission === 'denied') return;

          // 3. Se ainda não há permissão (default), podemos mostrar um convite
          if (Notification.permission === 'default') {
            const lastPrompt = sessionStorage.getItem('notification_prompt_shown');
            if (lastPrompt) return;

            // Pequeno delay para não aparecer imediatamente no reload do Android
            setTimeout(() => {
              toast.info("Deseja receber notificações?", {
                description: "Fique por dentro de novos recados e escalas.",
                action: {
                  label: "Ativar",
                  onClick: async () => {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                      await performSubscription(registration);
                    }
                  }
                },
                onDismiss: () => {
                  sessionStorage.setItem('notification_prompt_shown', 'true');
                },
                duration: 10000,
              });
            }, 3000);
            return;
          }

          // 4. Se já tem permissão, garante que está inscrito
          if (Notification.permission === 'granted') {
            await performSubscription(registration);
          }
        } catch (error) {
          console.error('Erro ao configurar notificações push:', error);
        }
      };

      const performSubscription = async (registration: ServiceWorkerRegistration) => {
        const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicVapidKey || !user) return;

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
          });
        }

        // Enviar subscrição para o servidor
        try {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ subscription }),
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          console.error('Erro ao enviar subscrição para o servidor:', err);
        }
      };

      const registerServiceWorker = async () => {
        try {
          // Adicionamos ?v= para contornar o cache do Safari no arquivo sw.js
          const registration = await navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`)
          
          // Função para mostrar o aviso de atualização
          const showUpdateToast = (waitingWorker: ServiceWorker) => {
            toast.info("Nova versão disponível!", {
              description: "Deseja atualizar o aplicativo agora?",
              action: {
                label: "Atualizar",
                onClick: () => {
                  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              },
              duration: Infinity, // Fica visível até o usuário agir
            });
          };

          // 1. Verificar se já existe um worker esperando
          if (registration.waiting) {
            showUpdateToast(registration.waiting);
          }

          // 2. Escutar por novos workers que cheguem ao estado 'installed' (waiting)
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast(newWorker);
              }
            });
          });

          console.log('PWA Service Worker registrado com sucesso:', registration.scope)
          
          registration.update();
          
          await subscribeToNotifications(registration);

          let lastUpdateCheck = Date.now();

          const intervalId = setInterval(() => {
            registration.update();
            lastUpdateCheck = Date.now();
          }, 5 * 60 * 1000);

          const focusHandler = () => {
            const now = Date.now();
            // Verifica no máximo uma vez a cada 2 minutos ao ganhar foco
            if (now - lastUpdateCheck > 2 * 60 * 1000) {
              lastUpdateCheck = now;
              registration.update();
            }
          };
          window.addEventListener('focus', focusHandler);

          const visibilityHandler = () => {
            const now = Date.now();
            if (document.visibilityState === 'visible' && (now - lastUpdateCheck > 2 * 60 * 1000)) {
              lastUpdateCheck = now;
              registration.update();
            }
          };
          document.addEventListener('visibilitychange', visibilityHandler);

          return { intervalId, focusHandler, visibilityHandler };
        } catch (error) {
          console.error('Erro ao registrar PWA Service Worker:', error)
          return null;
        }
      }

      let cleanup: any = null;
      if (process.env.NODE_ENV === 'production') {
        registerServiceWorker().then(c => cleanup = c);
      }

      // 2. Lógica de Instalação Manual
      const handleBeforeInstallPrompt = (e: any) => {
        e.preventDefault();
        window.deferredPrompt = e;
        window.dispatchEvent(new CustomEvent('pwa-installable'));
      };

      const handleAppInstalled = () => {
        window.deferredPrompt = null;
        window.dispatchEvent(new CustomEvent('pwa-installed'));
        console.log('PWA: Aplicativo instalado com sucesso!');
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
        if (cleanup) {
          clearInterval(cleanup.intervalId);
          window.removeEventListener('focus', cleanup.focusHandler);
          document.removeEventListener('visibilitychange', cleanup.visibilityHandler);
        }
      };
    }
  }, [user])

  return null
}

// Auxiliar para converter a chave VAPID
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
