export class Quota {
  constructor(amount, seconds, currentTick) {
    this.remaining = amount
    this.amountPerTick = amount / (seconds * 15)
    this.cap = amount
    this.lastTick = currentTick
  }

  canSpend(currentTick) {
    this.remaining += this.amountPerTick * (currentTick - this.lastTick)
    this.lastTick = currentTick
    if (this.remaining < 1) return false
    if (this.remaining > this.cap) this.remaining = this.cap
    this.remaining--
    return true
  }
}