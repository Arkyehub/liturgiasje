import { groupAnnouncements } from "./groupAnnouncements"

const a = (id: string, isRead: boolean, isPublished = true) => ({ id, isRead, isPublished })

describe("groupAnnouncements", () => {
  it("só envia ao grupo recados publicados e lidos", () => {
    const { visible, read } = groupAnnouncements([a("1", false), a("2", true), a("3", true, false)], true)
    expect(read.map((x) => x.id)).toEqual(["2"])
    expect(visible.map((x) => x.id)).toEqual(["1", "3"])
  })

  it("rascunho lido nunca entra no grupo", () => {
    const { read } = groupAnnouncements([a("d", true, false)], true)
    expect(read).toHaveLength(0)
  })

  it("recado fixado fica fora do grupo até soltar", () => {
    expect(groupAnnouncements([a("p", true)], true, new Set(["p"])).read).toHaveLength(0)
    expect(groupAnnouncements([a("p", true)], true, new Set()).read).toHaveLength(1)
  })

  it("sem login nada vai para o grupo", () => {
    expect(groupAnnouncements([a("1", true)], false).read).toHaveLength(0)
  })
})
