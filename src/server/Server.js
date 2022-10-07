import uWS from "uWebSockets.js"
import { ServerClientManager } from "../client/ServerClientManager.js"
import { ServerIpManager } from "../ip/ServerIpManager.js"
import { ServerWorldManager } from "../world/ServerWorldManager.js"
import { StatsTracker } from "../stats/StatsTracker.js"
import { ServerRegionManager } from "../region/ServerRegionManager.js"
import { data as miscData, saveAndClose } from "./miscData.js"

let textEncoder = new TextEncoder()
let textDecoder = new TextDecoder()

export class Server {
  constructor(config) {
    this.config = config

    this.clients = new ServerClientManager(this)
    this.ips = new ServerIpManager(this)
    this.worlds = new ServerWorldManager(this)
    this.regions = new ServerRegionManager(this)

    this.listenSocket = null
    this.wsServer = this.createServer()
    this.globalTopic = Uint8Array.from([0x00]).buffer
    this.adminTopic = Uint8Array.from([0x01]).buffer

    this.currentTick = 0
    this.nextTickTime = performance.now() + 1000 / 15
    this.tickTimeout = this.setTickTimeout()

    this.stats = new StatsTracker(this)

    this.whitelistId = miscData.whitelistId
    this.lockdown = false
    
    this.destroyed = false
  }

  async destroy() {
    if (this.destroyed) return
    this.destroyed = true
    clearTimeout(this.tickTimeout)
    if (this.listenSocket) uWS.us_listen_socket_close(this.listenSocket)
    this.clients.destroy()
    await this.worlds.destroy()
    await this.regions.destroy()
    await this.ips.destroy()
    await saveAndClose()
  }

  createServer() {
    let server = uWS.App()
    server.ws("/*", {
      maxPayloadLength: 1 << 15,
      maxBackpressure: 2 << 21,
      idleTimeout: 0,
      upgrade: async (res, req, context) => {
        try {
          //read headers
          let secWebSocketKey = req.getHeader("sec-websocket-key")
          let secWebSocketProtocol = req.getHeader("sec-websocket-protocol")
          let secWebSocketExtensions = req.getHeader("sec-websocket-extensions")
          let origin = req.getHeader("origin")
          //handle abort
          let aborted = false
          res.onAborted(() => {
            aborted = true
          })
          //async get ip data, then upgrade
          let ip
          if (process.env.IS_PROXIED === "true") {
            ip = req.getHeader(process.env.REAL_IP_HEADER)
          } else {
            ip = textDecoder.decode(res.getRemoteAddressAsText())
          }
          ip = await this.ips.fetch(ip)
          if (aborted) return
          if (this.destroyed) {
            res.writeStatus("503 Service Unavailable")
            res.end()
          } else {
            res.upgrade({
              origin,
              ip,
              closed: false
            }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
          }
        } catch (error) {
          console.error(error)
        }
      },
      open: ws => {
        ws.subscribe(this.globalTopic)
        try {
          this.stats.totalConnections++
          let client = this.clients.createClient(ws)
          ws.client = client
          client.startProtocol()
        } catch (error) {
          console.error(error)
        }
      },
      message: (ws, message, isBinary) => {
        try {
          ws.client.handleMessage(message, isBinary)
        } catch (error) {
          console.error(error)
        }
      },
      close: (ws, code, message) => {
        try {
          ws.closed = true
          ws.client.destroy()
        } catch (error) {
          console.error(error)
        }
      }
    })
    server.any("/api/*", async (res, req) => {

    })
    server.any("/*", (res, req) => {
      res.writeStatus("400 Bad Request")
      res.end()
    })
    server.listen(parseInt(process.env.WS_PORT), listenSocket => {
      this.listenSocket = listenSocket
    })
    return server
  }

  setTickTimeout() {
    let timeUntilTick = this.nextTickTime - performance.now()
    if (timeUntilTick < -5000) {
      console.warn(`Ticking behind by ${Math.round(-timeUntilTick)}ms`)
    }
    this.tickTimeout = setTimeout(this.tick.bind(this), timeUntilTick)
  }

  tick() {
    let tick = ++this.currentTick
    this.nextTickTime = this.nextTickTime + 1000 / 15
    this.setTickTimeout()

    //every 10 seconds
    let semiMajorTick = (tick % 15) === 0
    //every hour
    let majorTick = (tick % 54000) === 0

    if (semiMajorTick) {
      this.clients.tickExpiration(tick)
      this.worlds.tickExpiration(tick)
      this.ips.tickExpiration(tick)
    }
    if (majorTick) {
      this.stats.tickPixels()
    }
    this.clients.tick(tick)
    this.worlds.tick(tick)
  }

  adminMessage(message) {
    let arrayBuffer = textEncoder.encode(message).buffer
    this.wsServer.publish(this.adminTopic, arrayBuffer, true)
  }

  broadcastBuffer(buffer) {
    let arrayBuffer = buffer.buffer
    this.wsServer.publish(this.globalTopic, arrayBuffer, true)
  }

  broadcastString(string) {
    let arrayBuffer = textEncoder.encode(string).buffer
    this.wsServer.publish(this.globalTopic, arrayBuffer, false)
  }

  resetWhitelist() {
    this.whitelistId++
    miscData.whitelistId = this.whitelistId
  }

  kickNonAdmins() {
    let count = 0
    for (let client of this.clients.map.values()) {
      if (client.rank === 3) continue
      client.destroy()
      count++
    }
    return count
  }

  setLockdown(state) {
    this.lockdown = state
    this.adminMessage(`DEVLockdown mode ${state ? "enabled" : "disabled"}.`)
    if (!state) return
    for (let client of this.clients.map.values()) {
      if (client.rank < 3) continue
      if (client.ip.whitelistId === this.whitelistId) continue
      client.ip.setProp("whitelist", this.whitelistId)
    }
  }

  checkLockdown() {
    for (let client of this.clients.map.values()) {
      if (client.rank < 3) continue
      if (client.ip.whitelistId !== this.whitelistId) continue
      return
    }
    //if we made it through the for loop, then there are no whitelisted admins
    this.setLockdown(false)
  }
}

//simple way to keep track of the server's performance

let userUsage = process.cpuUsage().user
let systemUsage = process.cpuUsage().system
setInterval(() => {
  let newUserUsage = process.cpuUsage().user
  let userDiff = newUserUsage - userUsage
  userUsage = newUserUsage
  let newSystemUsage = process.cpuUsage().system
  let systemDiff = newSystemUsage - systemUsage
  systemUsage = newSystemUsage
  console.log(userDiff / 1000000, systemDiff / 1000000)
}, 1000)
