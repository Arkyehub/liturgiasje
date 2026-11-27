import { DEFAULT_LAMP_RULES, SettingsError, normalizeSettings, settingsErrorMessage } from "./PlannerSettings"

test("lixo ou nulo vira o padrão: nenhuma missa e todas as regras ligadas", () => {
  for (const raw of [null, undefined, 5, "x", [], {}]) {
    expect(normalizeSettings(raw)).toEqual({ standardMasses: [], lampRules: DEFAULT_LAMP_RULES, hasCustom: false })
  }
})

test("chave de regra ausente = ligada; só false desliga; hasCustom reflete regra desligada", () => {
  const s = normalizeSettings({ standardMasses: [], lampRules: { balance: false, sameDay: "nao", coisa: false } })
  expect(s.lampRules).toEqual({ ...DEFAULT_LAMP_RULES, balance: false })
  expect(s.hasCustom).toBe(true)
})

test("missas padrão: descarta itens inválidos, ordena as funções e mantém a ordem recebida", () => {
  const s = normalizeSettings({
    standardMasses: [
      { weekday: 0, time: "09:00", roles: ["P", "C", "1L", "X"] },
      { weekday: 7, time: "09:00", roles: ["C"] },
      { weekday: 2, time: "9:00", roles: ["C"] },
      { weekday: 2, time: "19:00", roles: [] },
      { weekday: 2, time: "19:00", roles: ["L", "C"] },
      "x",
    ],
  })
  expect(s.standardMasses).toEqual([
    { weekday: 0, time: "09:00", roles: ["C", "1L", "P"] },
    { weekday: 2, time: "19:00", roles: ["C", "L"] },
  ])
  expect(s.hasCustom).toBe(true)
})

test("mensagens de erro em português; código desconhecido cai na genérica", () => {
  expect(settingsErrorMessage(new SettingsError("invalid_settings"))).toMatch(/inválido/)
  expect(settingsErrorMessage(new SettingsError("settings_too_large"))).toMatch(/grandes demais/)
  expect(settingsErrorMessage(new Error("x"))).toMatch(/Tente novamente/)
})
