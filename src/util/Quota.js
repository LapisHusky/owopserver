export class Quota {
  constructor(amount, seconds, currentTick, depleted) {
    this.remaining = depleted ? 0 : amount
    this.amountPerTick = amount / (seconds * 15)
    this.amount = amount
    this.lastTick = currentTick
  }

  canSpend(currentTick) {
    this.remaining += this.amountPerTick * (currentTick - this.lastTick)
    this.lastTick = currentTick
    if (this.remaining < 1) return false
    if (this.remaining > this.amount) this.remaining = this.amount
    this.remaining--
    return true
  }
  
  deplete(currentTick) {
    this.remaining = 0
    this.lastTick = currentTick
  }

  setParams(amount, seconds, currentTick) {
    this.remaining += this.amountPerTick * (currentTick - this.lastTick)
    if (this.remaining > this.amount) this.remaining = this.amount
    this.amount = amount
    this.amountPerTick = amount / (seconds * 15)
    this.lastTick = currentTick
    if (this.remaining > amount) this.remaining = amount
  }
}