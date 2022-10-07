export class Quota {
  constructor(amount, seconds) {
    this.remaining = amount
    this.amountPerSecond = amount / seconds
    this.amount = amount
    this.lastTime = currentTime
  }

  canSpend() {
    this.remaining += this.amountPerSecond * (currentTime - this.lastTime)
    this.lastTime = currentTime
    if (this.remaining < 1) return false
    if (this.remaining > this.amount) this.remaining = this.amount
    this.remaining--
    return true
  }
  
  deplete() {
    this.remaining = 0
    this.lastTime = currentTime
  }

  setParams(amount, seconds) {
    this.remaining += this.amountPerSecond * (currentTime - this.lastTime)
    if (this.remaining > this.amount) this.remaining = this.amount
    this.amount = amount
    this.amountPerSecond = amount / seconds
    this.lastTime = currentTime
    if (this.remaining > amount) this.remaining = amount
  }
}

//this is slightly faster than calling performance.now() every check
//Date.now() is faster than performance.now(), but can be put off when the system time re-syncs
let currentTime = performance.now() / 1000

setInterval(() => {
  currentTime = performance.now() / 1000
}, 10)