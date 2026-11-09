import { render } from "@testing-library/react"
import { ScrollToTop } from "./ScrollToTop"
import { usePathname } from "next/navigation"

jest.mock("next/navigation", () => ({ usePathname: jest.fn() }))

const scrollTo = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  window.location.hash = ""
})

test("does not scroll on the first render", () => {
  ;(usePathname as jest.Mock).mockReturnValue("/admin/membros")
  render(<ScrollToTop />)
  expect(scrollTo).not.toHaveBeenCalled()
})

test("scrolls to the top when the page changes", () => {
  ;(usePathname as jest.Mock).mockReturnValue("/admin/membros")
  const { rerender } = render(<ScrollToTop />)
  ;(usePathname as jest.Mock).mockReturnValue("/admin/membros/abc")
  rerender(<ScrollToTop />)
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" })
})

test("keeps the browser position on back/forward navigation", () => {
  ;(usePathname as jest.Mock).mockReturnValue("/admin/membros/abc")
  const { rerender } = render(<ScrollToTop />)
  window.dispatchEvent(new PopStateEvent("popstate"))
  ;(usePathname as jest.Mock).mockReturnValue("/admin/membros")
  rerender(<ScrollToTop />)
  expect(scrollTo).not.toHaveBeenCalled()
  // a navegação seguinte volta a rolar normalmente
  ;(usePathname as jest.Mock).mockReturnValue("/perfil")
  rerender(<ScrollToTop />)
  expect(scrollTo).toHaveBeenCalledTimes(1)
})

test("does not override anchor links", () => {
  ;(usePathname as jest.Mock).mockReturnValue("/")
  const { rerender } = render(<ScrollToTop />)
  window.location.hash = "#slot-123"
  ;(usePathname as jest.Mock).mockReturnValue("/perfil")
  rerender(<ScrollToTop />)
  expect(scrollTo).not.toHaveBeenCalled()
})
