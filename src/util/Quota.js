export class Quota {
  constructor(amount, seconds, currentTick, depleted, smallBoost) {
    this.smallBoost = smallBoost
    //smallBoost is implemented for pquota, makes the cap a little higher so lag and tick imperfection doesn't cause pixels to fail
    this.remaining = depleted ? (smallBoost ? amount * 0.1 : 0) : amount
    this.amountPerTick = amount / (seconds * 15)
    this.cap = amount * (smallBoost ? 1.1 : 1)
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
  
  deplete(currentTick) {
    this.remaining = 0
    this.lastTick = currentTick
  }

  setParams(amount, seconds, currentTick) {
    this.remaining += this.amountPerTick * (currentTick - this.lastTick)
    if (this.remaining > this.cap) this.remaining = this.cap
    this.cap = amount * (this.smallBoost ? 1.1 : 1)
    this.amountPerTick = amount / (seconds * 15)
    this.lastTick = currentTick
    if (this.remaining > this.cap) this.remaining = this.cap
  }
}