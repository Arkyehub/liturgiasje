import { isAllowedPushEndpoint, isValidPushSubscription } from "./pushEndpoint"

const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" }

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGxyz",
    "https://wns2-par02p.notify.windows.com/?token=abc",
  ])("accepts %s", (url) => expect(isAllowedPushEndpoint(url)).toBe(true))

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc", // sem https
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "https://evil.test/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.test/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "ftp://fcm.googleapis.com/x",
    "not a url",
    "",
    42,
    null,
  ])("rejects %j", (url) => expect(isAllowedPushEndpoint(url)).toBe(false))
})

describe("isValidPushSubscription", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc"
  it("accepts a well-formed subscription", () => expect(isValidPushSubscription({ endpoint, keys })).toBe(true))
  it.each([
    [{ endpoint, keys: { ...keys, p256dh: "curta" } }],
    [{ endpoint, keys: { ...keys, auth: "***inválido***" } }],
    [{ endpoint }],
    [{ endpoint: "https://evil.test/x", keys }],
    [null],
    ["texto"],
  ])("rejects %j", (sub) => expect(isValidPushSubscription(sub)).toBe(false))
})
