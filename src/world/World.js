import { Region } from "../region/Region.js"

let textEncoder = new TextEncoder()

export class World {
  constructor(serverWorldManager, name, data) {
    this.serverWorldManager = serverWorldManager
    this.server = serverWorldManager.server

    this.name = name

    this.clients = new Map()
    this.regions = new Map()

    if (data === null) {
      this.restricted = false
      this.pass = null
      this.modpass = null
      this.pquota = null
      this.motd = null
      this.bgcolor = 0xffffff
      this.doubleModPQuota = true
      this.pastingAllowed = true
      this.maxPlayers = 255
      this.maxTpDistance = 5000000
      this.modPrefix = "(M)"
      this.simpleMods = false
      this.allowGlobalMods = true
      this.dataModified = false
    } else {
      data = JSON.parse(data)
      for (let key in data) {
        this[key] = data[key]
      }
      this.dataModified = false
    }

    this.incrementingId = 1

    //update stuff
    this.updateAllPlayers = false
    this.playerUpdates = []
    this.pixelUpdates = []
    this.playerDisconnects = []

    this.lastHeld = this.server.currentTick
    this.destroyed = false
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    for (let region of this.regions.values()) {
      region.destroy()
    }
    if (!this.dataModified) {
      this.serverWorldManager.worldDestroyed(this)
      return
    }
    let data = {
      restricted: this.restricted,
      pass: this.pass,
      modpass: this.modpass,
      pquota: this.pquota,
      motd: this.motd,
      bgcolor: this.bgcolor,
      doubleModPQuota: this.doubleModPQuota,
      pastingAllowed: this.pastingAllowed,
      maxPlayers: this.maxPlayers,
      maxTpDistance: this.maxTpDistance,
      modPrefix: this.modPrefix,
      allowGlobalMods: this.allowGlobalMods,
      simpleMods: this.simpleMods
    }
    this.serverWorldManager.worldDestroyed(this, JSON.stringify(data))
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

  broadcastBuffer(buffer) {
    let arrayBuffer = buffer.buffer
    for (let client of this.clients.values()) {
      client.ws.send(arrayBuffer, true)
    }
  }

  broadcastString(string) {
    let arrayBuffer = textEncoder.encode(string).buffer
    for (let client of this.clients.values()) {
      client.ws.send(arrayBuffer, false)
    }
  }

  isFull() {
    return this.clients.size >= this.maxPlayers
  }

  addClient(client) {
    let id = this.incrementingId++
    this.clients.set(id, client)
    client.world = this
    client.setUid(id)
    if (this.motd !== null) client.sendString(this.motd)
    client.lastUpdate = this.server.currentTick
    this.updateAllPlayers = true
    if (this.pass) {
      client.sendString("[Server] This world has a password set. Use '/pass PASSWORD' to unlock drawing.")
      return
    }
    if (this.restricted) return
    client.setRank(1)
  }

  removeClient(client) {
    this.clients.delete(client.uid)
    this.playerDisconnects.push(client.uid)
    if (this.clients.size === 0) this.lastHeld = this.server.currentTick
  }

  sendChat(client, message) {
    let string = `${client.getNick()}: ${message}`
    this.broadcastString(string)
  }

  getRegion(id) {
    if (this.regions.has(id)) return this.regions.get(id)
    let region = new Region(this, id)
    this.regions.set(id, region)
    return region
  }

  regionDestroyed(id) {
    this.regions.delete(id)
  }

  tickExpiration(tick) {
    for (let region of this.regions.values()) {
      if (!region.keepAlive(tick)) region.destroy()
    }
  }

  tick(tick) {
    if (!this.updateAllPlayers && this.playerUpdates.length === 0 && this.pixelUpdates.length === 0 && this.playerDisconnects.length === 0) return
    if (this.updateAllPlayers) {
      let array = []
      for (let client of this.clients.values()) {
        if (!client.stealth) array.push(client)
      }
      this.playerUpdates = array
    }
    let playerUpdateCount = this.playerUpdates.length
    let pixelUpdateCount = this.pixelUpdates.length
    let disconnectCount = this.playerDisconnects.length
    let buffer = Buffer.allocUnsafeSlow(playerUpdateCount * 16 + pixelUpdateCount * 15 + disconnectCount * 4 + 5)
    buffer[0] = 0x01
    buffer[1] = playerUpdateCount
    let pos = 2
    for (let client of this.playerUpdates) {
      buffer.writeUint32LE(client.uid, pos)
      pos += 4
      buffer.writeInt32LE(client.x, pos)
      pos += 4
      buffer.writeInt32LE(client.y, pos)
      pos += 4
      buffer[pos++] = client.r
      buffer[pos++] = client.g
      buffer[pos++] = client.b
      buffer[pos++] = client.tool
    }
    buffer.writeUint16LE(pixelUpdateCount, pos)
    pos += 2
    for (let updateBuffer of this.pixelUpdates) {
      updateBuffer.copy(buffer, pos)
      pos += 15
    }
    buffer[pos++] = disconnectCount
    for (let id of this.playerDisconnects) {
      buffer.writeUint32LE(id, pos)
      pos += 4
    }
    this.updateAllPlayers = false
    this.playerUpdates = []
    this.pixelUpdates = []
    this.playerDisconnects = []
    this.broadcastBuffer(buffer)
  }
}