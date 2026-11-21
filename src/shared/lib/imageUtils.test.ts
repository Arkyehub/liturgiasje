import { scaleToMax, MAX_CROPPED_SIDE, upscaleGoogleAvatarUrl, centerSquare } from "./imageUtils"

describe("scaleToMax", () => {
  it("shrinks big photos keeping the aspect ratio", () => {
    expect(scaleToMax(4000, 3000, 512)).toEqual({ width: 512, height: 384 })
    expect(scaleToMax(3000, 4000, 512)).toEqual({ width: 384, height: 512 })
    expect(scaleToMax(2048, 2048, MAX_CROPPED_SIDE)).toEqual({ width: 512, height: 512 })
  })
  it("never enlarges small images", () => {
    expect(scaleToMax(200, 100, 512)).toEqual({ width: 200, height: 100 })
    expect(scaleToMax(512, 512, 512)).toEqual({ width: 512, height: 512 })
  })
  it("never returns a zero-sized canvas", () => {
    expect(scaleToMax(0, 0, 512)).toEqual({ width: 1, height: 1 })
    expect(scaleToMax(10000, 1, 512)).toEqual({ width: 512, height: 1 })
  })
})

describe("upscaleGoogleAvatarUrl", () => {
  it("asks Google for a 512px version", () => {
    expect(upscaleGoogleAvatarUrl("https://lh3.googleusercontent.com/a/abc123=s96-c")).toBe("https://lh3.googleusercontent.com/a/abc123=s512-c")
    expect(upscaleGoogleAvatarUrl("https://lh3.googleusercontent.com/a/abc123=s96")).toBe("https://lh3.googleusercontent.com/a/abc123=s512-c")
  })
  it("leaves other URLs and invalid input untouched", () => {
    expect(upscaleGoogleAvatarUrl("https://example.com/foto=s96-c")).toBe("https://example.com/foto=s96-c")
    expect(upscaleGoogleAvatarUrl("https://lh3.googleusercontent.com/a/semtamanho")).toBe("https://lh3.googleusercontent.com/a/semtamanho")
    expect(upscaleGoogleAvatarUrl("nao-e-url")).toBe("nao-e-url")
  })
})

describe("centerSquare", () => {
  it("crops the largest centered square", () => {
    expect(centerSquare(400, 300)).toEqual({ x: 50, y: 0, side: 300 })
    expect(centerSquare(300, 400)).toEqual({ x: 0, y: 50, side: 300 })
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 })
  })
})
