import { Region } from "../region/Region.js"

let textEncoder = new TextEncoder()

export class World {
  constructor(serverWorldManager, name, data) {
    this.serverWorldManager = serverWorldManager
    this.server = serverWorldManager.server

    this.name = name
    let nameBuffer = Buffer.from(name)
    let topicBuffer = Buffer.allocUnsafeSlow(nameBuffer.length + 1)
    topicBuffer[0] = 0x02
    nameBuffer.copy(topicBuffer, 1)
    this.wsTopic = topicBuffer.buffer

    this.clients = new Map()
    this.regions = new Map()

    if (data === null) {
      this.restricted = false
      this.pass = null
      this.modpass = null
      this.pquota = null
      this.motd = null
      this.bgcolor = 0xffffff
      this.doubleModPquota = true
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
    this.playerUpdates = new Set()
    this.pixelUpdates = []
    this.playerDisconnects = new Set()

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
      doubleModPquota: this.doubleModPquota,
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
    this.server.wsServer.publish(this.wsTopic, arrayBuffer, true)
  }

  broadcastString(string) {
    let arrayBuffer = textEncoder.encode(string).buffer
    this.server.wsServer.publish(this.wsTopic, arrayBuffer, false)
  }

  isFull() {
    return this.clients.size >= this.maxPlayers
  }

  addClient(client) {
    let id = this.incrementingId++
    this.clients.set(id, client)
    client.world = this
    client.ws.subscribe(this.wsTopic)
    client.setUid(id)
    if (this.motd !== null) client.sendString(this.motd)
    client.lastUpdate = this.server.currentTick
    this.updateAllPlayers = true
    if (this.restricted) return
    if (this.pass) {
      client.sendString("[Server] This world has a password set. Use '/pass PASSWORD' to unlock drawing.")
      return
    }
    client.setRank(1)
  }

  removeClient(client) {
    this.clients.delete(client.uid)
    this.playerDisconnects.add(client.uid)
    this.playerUpdates.delete(client)
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
    if (!this.updateAllPlayers && this.playerUpdates.size === 0 && this.pixelUpdates.length === 0 && this.playerDisconnects.size === 0) return
    if (this.updateAllPlayers) {
      this.updateAllPlayers = false
      for (let client of this.clients.values()) {
        if (!client.stealth) this.playerUpdates.add(client)
      }
    }
    let playerUpdateCount = Math.min(this.playerUpdates.size, 255)
    let pixelUpdateCount = this.pixelUpdates.length
    let disconnectCount = Math.min(this.playerDisconnects.size, 255)
    let buffer = Buffer.allocUnsafeSlow(playerUpdateCount * 16 + pixelUpdateCount * 15 + disconnectCount * 4 + 5)
    buffer[0] = 0x01
    buffer[1] = playerUpdateCount
    let pos = 2
    let count = 0
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
      this.playerUpdates.delete(client)
      if (++count === 255) break
    }
    buffer.writeUint16LE(pixelUpdateCount, pos)
    pos += 2
    for (let updateBuffer of this.pixelUpdates) {
      updateBuffer.copy(buffer, pos)
      pos += 15
    }
    buffer[pos++] = disconnectCount
    count = 0
    for (let id of this.playerDisconnects) {
      buffer.writeUint32LE(id, pos)
      pos += 4
      this.playerDisconnects.delete(id)
      if (++count === 255) break
    }
    this.pixelUpdates = []
    this.broadcastBuffer(buffer)
  }

  kickNonAdmins() {
    let count = 0
    for (let client of this.clients.values()) {
      if (client.rank === 3) continue
      client.destroy()
      count++
    }
    return count
  }
}