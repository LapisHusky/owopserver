import { getIpFromHeader } from "../util/util.js"

let textDecoder = new TextDecoder()

export async function handleRequest(server, res, req) {
  try {
    let url = req.getUrl()
    if (url.length > 1 && url.endsWith("/")) url = url.substring(0, url.length - 1)
    switch (url) {
      case "/api":
        await printStatus(server, res, req)
        return
      case "/api/disconnectme":
        disconnectUser(server, res, req)
        return
      case "/api/stats":
        stats(server, res, req)
        return
      case "/api/banme":
        await banSelf(server, res, req)
        return
      case "/api/playerinfo":
        await getPlayerInfo(server, res, req)
        return
      default:
        res.end('"Unknown request"')
    }
  } catch (error) {
    console.log(error)
  }
}

async function printStatus(server, res, req) {
  let aborted = false
  res.onAborted(() => {
    aborted = true
  })
  let ip
  if (process.env.IS_PROXIED === "true") {
    ip = getIpFromHeader(req.getHeader(process.env.REAL_IP_HEADER))
  } else {
    ip = textDecoder.decode(res.getRemoteAddressAsText())
  }
  ip = await server.ips.fetch(ip)
  if (aborted) return
  let obj = {
    motd: server.config.motd,
    totalConnections: server.stats.totalConnections,
    captchaEnabled: server.config.captchaSecurity > 0,
    numSelfBans: server.stats.numSelfBans,
    maxConnectionsPerIp: server.config.maxConnectionsPerIp,
    users: server.clients.map.size,
    uptime: server.stats.getUptime(),
    yourIp: ip.ip,
    yourConns: ip.clients.size,
    banned: ip.banExpiration
  }
  res.cork(() => {
      res.end(JSON.stringify(obj))
  })
}

function disconnectUser(server, res, req) {
  let ip
  if (process.env.IS_PROXIED === "true") {
    ip = getIpFromHeader(req.getHeader(process.env.REAL_IP_HEADER))
  } else {
    ip = textDecoder.decode(res.getRemoteAddressAsText())
  }
  ip = server.ips.map.get(ip)
  if (!ip || ip.constructor === Promise || ip.clients.size === 0) {
    res.end('{"hadEffect":false}')
    return
  }
  ip.kick()
  res.end('{"hadEffect":true}')
}

function stats(server, res, req) {
  let obj = {
    currentPixelsPlaced: server.stats.currentPixelsPlaced,
    lastPushOn: server.stats.lastPushOn,
    pixelsPlacedPerHour: server.stats.pixelsPlacedPerHour
  }
  res.end(JSON.stringify(obj))
}

async function banSelf(server, res, req) {
  if (req.getMethod() !== "put") {
    res.end("Nope, you're gonna need something else to get yourself banned.")
    return
  }
  let aborted = false
  res.onAborted(() => {
    aborted = true
  })
  let ip
  if (process.env.IS_PROXIED === "true") {
    ip = getIpFromHeader(req.getHeader(process.env.REAL_IP_HEADER))
  } else {
    ip = textDecoder.decode(res.getRemoteAddressAsText())
  }
  ip = await server.ips.fetch(ip)
  if (aborted) return
  if (ip.banExpiration === -1 || ip.banExpiration > Date.now()) {
    res.end("You're already banned!")
    return
  }
  if (ip.clients.size === 0) {
    res.end("To make it harder for you to use this, you have to be connected to get yourself banned.")
    return
  }
  for (let client of ip.clients.values()) {
    if (client.rank < 3) continue
    res.end("No, you can't ban an admin with this.")
    return
  }
  ip.ban(Date.now() + 300000)
  res.end("You just banned yourself for 5 minutes. There are no funny messages here. Was it worth it?")
  server.stats.numSelfBans++
}

async function getPlayerInfo(server, res, req) {
  let password = req.getHeader("x-password")
  let id = req.getHeader("x-player-id")
  let ip = req.getHeader("x-player-ip")
  let aborted = false
  res.onAborted(() => {
    aborted = true
  })
  let world = await server.worlds.fetch("main")
  if (aborted) return
  if (password !== world.modpass) {
    res.cork(() => {
      res.end('{"type":"error","data":"no"}')
    })
    return
  }
  if (ip) {
    let ipData = await server.ips.fetch(ip)
    if (aborted) return
    let obj = {
      type: "ip",
      data: {
        whitelisted: ipData.isWhitelisted(),
        banned: ipData.banExpiration === -1 || ipData.banExpiration > Date.now(),
        numConns: ipData.clients.size
      }
    }
    let connInfo = []
    for (let client of ipData.clients.values()) {
      connInfo.push({
        nick: client.getNick(),
        //not clean but whatever
        lastMovement: Date.now() - Math.round((1000 / 15) * (server.currentTick - client.lastUpdate)),
        rank: client.rank,
        pos: {
          x: client.x,
          y: client.y,
        },
        id: client.uid,
        isMuted: client.mute,
        world: client.world.name
      })
    }
    obj.data.connInfo = connInfo
    res.cork(() => {
      res.end(JSON.stringify(obj))
    })
    return
  }
  if (id) {
    let client = world.clients.get(parseInt(id))
    if (!client) {
      res.cork(() => {
        res.end('{"type":"id","data":null}')
      })
      return
    }
    let obj = {
      type: "id",
      data: client.ip.ip
    }
    res.cork(() => {
      res.end(JSON.stringify(obj))
    })
    return
  }
  res.cork(() => {
    res.end('{"type":"error","data":"bruh what do you want me to do"}')
  })
}
