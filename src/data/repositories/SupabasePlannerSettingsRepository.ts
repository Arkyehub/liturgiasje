import { supabase } from "@/shared/api/supabase"
import {
  LampRules,
  PlannerSettings,
  SettingsError,
  SettingsErrorCode,
  StandardMass,
  normalizeSettings,
} from "@/domain/models/PlannerSettings"
import { PlannerSettingsRepository } from "@/domain/repositories/PlannerSettingsRepository"

const KNOWN_CODES: SettingsErrorCode[] = ["forbidden", "invalid_settings", "settings_too_large"]

function toSettingsError(error: unknown): SettingsError {
  const source = typeof error === "object" && error !== null ? (error as { code?: unknown; message?: unknown }) : {}
  const message = typeof source.message === "string" ? source.message : ""
  const known = KNOWN_CODES.find((code) => message.includes(code))
  if (known) return new SettingsError(known, error)
  if (
    source.code === "PGRST202" ||
    message.includes("Could not find the function") ||
    /function\s+(public\.)?planner_settings_\w+.*does not exist/.test(message)
  ) {
    return new SettingsError("unavailable", error)
  }
  return new SettingsError("unknown", error)
}

export class SupabasePlannerSettingsRepository implements PlannerSettingsRepository {
  private async call(fn: string, args: Record<string, unknown>): Promise<PlannerSettings> {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw toSettingsError(error)
    return normalizeSettings(data)
  }

  get(): Promise<PlannerSettings> {
    return this.call("planner_settings_get", {})
  }

  save(standardMasses: StandardMass[], lampRules: LampRules): Promise<PlannerSettings> {
    return this.call("planner_settings_save", { p_standard_masses: standardMasses, p_lamp_rules: lampRules })
  }
}
