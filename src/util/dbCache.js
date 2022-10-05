export class Cache {
  //getter and setter functions are async, may return null, but should never reject
  constructor(expiration, getter, setter) {
    this.expiration = expiration
    this.getter = getter
    this.setter = setter
    this.lastRemoval = Date.now()
    this.cache = new Map()
    this.currentlyGetting = new Map()
    this.currentlySetting = new Map()
  }

  get(key) {
    let now = Date.now()
    if (now - this.lastRemoval > 30000) this.removeOldItems(now)
    if (this.cache.has(key)) {
      let valueObj = this.cache.get(key)
      valueObj.time = now
      return valueObj.value
    }
    if (this.currentlyGetting.has(key)) return this.currentlyGetting.get(key).promise
    if (this.currentlySetting.has(key)) return this.currentlySetting.get(key)
    let getterPromise = this.getter(key)
    let higherPromise, resolve
    higherPromise = new Promise(res => resolve = res)
    this.currentlyGetting.set(key, {
      promise: higherPromise,
      resolve
    })
    higherPromise.then(result => {
      let valueObj = {
        value: result,
        time: now,
        modified: false
      }
      this.cache.set(key, valueObj)
      this.currentlyGetting.delete(key)
    })
    //higherPromise may already be resolved because we set during that period, but that's fine, this next resolve wouldn't do anything in that case
    getterPromise.then(result => resolve(result))
    return higherPromise
  }

  set(key, value) {
    if (this.currentlyGetting.has(key)) {
      this.currentlyGetting.get(key).resolve(value)
      return
    }
    if (!this.cache.has(key)) {
      this.cache.set(key, {
        value: value,
        time: Date.now(),
        modified: true
      })
      return
    }
    let valueObj = this.cache.get(key)
    valueObj.value = value
    valueObj.time = Date.now()
    valueObj.modified = true
  }

  removeOldItems(now) {
    for (let [key, value] of this.cache.entries()) {
      if (now - value.time > this.expiration) this.itemExpired(key, value)
    }
  }

  //an item should not be able to expire twice within expirationTime
  itemExpired(key, valueObject) {
    this.cache.delete(key)
    if (!valueObject.modified) return
    let value = valueObject.value
    if (value === undefined || value === null) return
    this.currentlySetting.set(key, value)
    let promise = this.setter(key, value)
    promise.then(() => this.currentlySetting.delete(key))
    return promise
  }

  saveAll() {
    let promises = []
    for (let [key, value] of this.cache.entries()) {
      promises.push(this.itemExpired(key, value))
    }
    return Promise.all(promises)
  }
}