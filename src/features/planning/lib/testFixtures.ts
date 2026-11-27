import type { StandardMass } from "@/domain/models/PlannerSettings"

/** Estrutura de exemplo SÓ para os testes: o sistema não traz nenhuma missa padrão. */
export const SAMPLE_STANDARD: StandardMass[] = [
  { weekday: 2, time: "19:00", roles: ["C", "L"] },
  { weekday: 5, time: "19:00", roles: ["C", "L"] },
  ...["07:00", "09:00", "11:00", "19:00"].map((time): StandardMass => ({ weekday: 0, time, roles: ["C", "1L", "2L", "P"] })),
]
