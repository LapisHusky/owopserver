import fetch from "node-fetch"

export async function verifyCaptchaToken(token) {
  try {
    let result = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.CAPTCHA_SECRET}&response=${encodeURIComponent(token)}`, {
      method: "POST"
    })
    result = await result.json()
    return result.success === true
  } catch (error) {
    return false
  }
}

export function validateQuotaString(string) {
  let split = string.split(",")
  if (split.length !== 2) return false
  if (!split[0].match(/^\d+$/)) return false
  if (!split[1].match(/^\d+$/)) return false
  if (parseInt(split[0]) > 65535) return false
  if (parseInt(split[1]) > 65535) return false
  return true
}

export function parseColor(string) {
  if (!string.match(/^#[A-Fa-f0-9]{6}$/)) return false
  return parseInt(string.substring(1), 16)
}