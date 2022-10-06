export class Quota {
  constructor(amount, seconds, currentTick, depleted) {
    this.remaining = depleted ? 0 : amount
    this.amountPerTick = amount / (seconds * 15)
    this.cap = amount * 1.1 //multiplying by 1.1 helps keep quotas from falsely hitting if there's brief lag or if tick imprecision matters
    this.lastTick = currentTick
  }

  canSpend(currentTick) {
    this.remaining += this.amountPerTick * (currentTick - this.lastTick)
    this.lastTick = currentTick
    console.log(this.remaining, this.cap)
    if (this.remaining < 1) return false
    if (this.remaining > this.cap) this.remaining = this.cap
    this.remaining--
    return true
  }
  
  deplete(currentTick) {
    this.remaining = 0
    this.lastTick = currentTick
  }

  setParams(amount, seconds, currentTick) {
    this.remaining += this.amountPerTick * (currentTick - this.lastTick)
    if (this.remaining > this.cap) this.remaining = this.cap
    this.cap = amount * 1.1
    this.amountPerTick = amount / (seconds * 15)
    this.lastTick = currentTick
    if (this.remaining > amount) this.remaining = cap
  }
}