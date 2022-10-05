import { Quota } from "../util/Quota.js"

export class Ip {
  constructor(serverIpManager, ip, data) {
    this.serverIpManager = serverIpManager
    this.server = serverIpManager.server

    this.ip = ip

    let tick = this.server.currentTick

    this.clients = new Map()
    this.captchaquota = new Quota(5, 10, tick)

    if (data === null) {
      this.ban = 0
      this.whitelisted = false
      this.dataModified = false
    } else {
      data = JSON.parse(data)
      for (let key in data) {
        this[key] = data[key]
      }
      this.dataModified = false
    }

    this.lastHeld = tick
    this.destroyed = false
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.dataModified) {
      this.serverIpManager.ipDestroyed(this)
      return
    }
    let data = {
      ban: this.ban,
      whitelisted: this.whitelisted
    }
    this.serverIpManager.ipDestroyed(this, JSON.stringify(data))
  }

  setProp(key, value) {
    this[key] = value
    this.dataModified = true
  }

  keepAlive(tick) {
    if (this.clients.size > 0) return true
    if (tick - this.lastHeld < 150) return true
    return false
  }

  addClient(client) {
    this.clients.set(client.id, client)
  }

  removeClient(client) {
    this.clients.delete(client.id)
    if (this.clients.size === 0) this.lastHeld = this.server.currentTick
  }

  tooManyClients() {
    return this.clients.size > this.server.config.maxConnectionsPerIp
  }

  kick() {
    for (let client of this.clients.values()) {
      client.destroy()
    }
  }
}