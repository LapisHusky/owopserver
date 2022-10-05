import { Level } from "level"
import { Cache } from "../util/dbCache.js"
import { Ip } from "./Ip.js"

export class ServerIpManager {
  constructor(server) {
    this.server = server
    this.map = new Map()
    this.db = new Level("./data/ips", {
      keyEncoding: "utf8",
      valueEncoding: "utf8"
    })
    this.dbCache = new Cache(10000, this.dbGetter.bind(this), this.dbSetter.bind(this))

    this.destroyed = false
  }

  async fetch(ip) {
    if (this.map.has(ip)) return this.map.get(ip)
    let promise, resolve
    promise = new Promise(res => resolve = res)
    this.map.set(ip, promise)
    let ipData = await this.dbCache.get(ip)
    let ipObject = new Ip(this, ip, ipData)
    this.map.set(ip, ipObject)
    resolve(ipObject)
    return ipObject
  }

  async dbGetter(key) {
    try {
      return await this.db.get(key)
    } catch (error) {
      return null
    }
  }

  dbSetter(key, value) {
    return this.db.put(key, value)
  }

  async destroy() {
    if (this.destroyed) return
    this.destroyed = true
    for (let ip of this.map.values()) {
      if (ip.constructor !== Ip) continue
      ip.destroy()
    }
    await this.dbCache.saveAll()
    this.db.close()
  }

  ipDestroyed(ipObject, data) {
    let ip = ipObject.ip
    this.map.delete(ip)
    if (data) this.dbCache.set(ip, data)
  }

  tickExpiration(tick) {
    for (let ipObject of this.map.values()) {
      //ignore promises
      if (ipObject.constructor !== Ip) continue
      if (!ipObject.keepAlive(tick)) ipObject.destroy()
    }
  }
}