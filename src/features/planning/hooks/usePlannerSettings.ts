"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DEFAULT_LAMP_RULES,
  SettingsError,
  settingsErrorMessage,
  type LampRules,
  type PlannerSettings,
  type StandardMass,
} from "@/domain/models/PlannerSettings"
import { makeGetPlannerSettings, makeSavePlannerSettings } from "@/main/factories/usecases/plannerSettings"

export type PlannerSettingsStatus = "loading" | "ready" | "unavailable" | "error"

export interface UsePlannerSettingsResult {
  status: PlannerSettingsStatus
  standardMasses: StandardMass[]
  lampRules: LampRules
  hasCustom: boolean
  /** Mensagem do último erro de leitura ou de gravação (a gravação não mexe em `status`). */
  error: string | null
  /** Grava; devolve true e atualiza o estado em caso de sucesso, false (com `error`) em caso de falha. */
  save(standardMasses: StandardMass[], lampRules: LampRules): Promise<boolean>
  reload(): void
}

const DEFAULTS: PlannerSettings = { standardMasses: [], lampRules: DEFAULT_LAMP_RULES, hasCustom: false }

/**
 * Configurações do coordenador (missas padrão e regras da lâmpada), lidas uma vez ao abrir a tela.
 * Função ausente no banco (`unavailable`): padrões em silêncio. Falha de leitura: padrões + aviso.
 */
export function usePlannerSettings(): UsePlannerSettingsResult {
  const [status, setStatus] = useState<PlannerSettingsStatus>("loading")
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const aliveRef = useRef(true)
  /** Cada leitura e cada gravação bem-sucedida avançam a geração: uma leitura antiga nunca sobrescreve uma gravação nova. */
  const generationRef = useRef(0)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const generation = ++generationRef.current
    // Nova leitura (primeira ou "tentar novamente"): volta ao estado de carregamento até a resposta chegar.
    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus("loading")
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    makeGetPlannerSettings()
      .execute()
      .then(
        (loaded) => {
          if (cancelled || generation !== generationRef.current) return
          setSettings(loaded)
          setStatus("ready")
        },
        (e: unknown) => {
          if (cancelled || generation !== generationRef.current) return
          setSettings(DEFAULTS)
          if (e instanceof SettingsError && e.code === "unavailable") {
            setStatus("unavailable")
            return
          }
          setStatus("error")
          setError(settingsErrorMessage(e))
          toast.warning("Não foi possível ler suas regras; usando as regras padrão.")
        },
      )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const save = useCallback(async (standardMasses: StandardMass[], lampRules: LampRules) => {
    try {
      const saved = await makeSavePlannerSettings().execute(standardMasses, lampRules)
      generationRef.current++
      if (!aliveRef.current) return true
      setSettings(saved)
      setStatus("ready")
      setError(null)
      return true
    } catch (e) {
      if (aliveRef.current) setError(settingsErrorMessage(e))
      return false
    }
  }, [])

  const reload = useCallback(() => setAttempt((a) => a + 1), [])

  return useMemo(
    () => ({
      status,
      standardMasses: settings.standardMasses,
      lampRules: settings.lampRules,
      hasCustom: settings.hasCustom,
      error,
      save,
      reload,
    }),
    [status, settings, error, save, reload],
  )
}
