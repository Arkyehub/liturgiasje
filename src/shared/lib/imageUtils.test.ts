import { scaleToMax, MAX_CROPPED_SIDE } from "./imageUtils"

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
