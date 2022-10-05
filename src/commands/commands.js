import { validateQuotaString } from "../util/util.js"

export const commands = new Map()

commands.set("nick", {
  minRank: 0,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.nick = null
      client.sendString("Nickname reset.")
      return
    }
    let nick = args.trim()
    let maxLength = [16, 16, 40, Infinity][client.rank]
    if (nick.length > maxLength) {
      client.sendString(`Nickname too long! (Max: ${maxLength})`)
      return
    }
    let nickToSet
    switch (client.rank) {
      case 3:
        nickToSet = nick
        break
      case 2:
        nickToSet = `${client.world.modPrefix} ${nick}`
        break
      case 1:
      case 0:
        nickToSet = `[${client.uid}] ${nick}`
    }
    client.nick = nickToSet
    client.sendString(`Nickname set to: '${nick}'`)
  }
})
commands.set("pass", {
  minRank: 0,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.sendString("Use to unlock drawing on a protected world.")
      client.sendString("Usage: /pass WORLDPASSWORD")
      return
    }
    if (client.rank >= 2) return
    if (args === client.world.modpass) {
      client.server.adminMessage(`DEV${client.uid} (${client.world.name}, ${client.ip.ip}) Got local mod`)
      client.setRank(2)
      return
    } else if (client.rank < 1 && args === client.world.pass) {
      if (client.world.restricted) {
        client.sendString("Can't unlock drawing, this world is restricted!")
        return
      }
      client.setRank(1)
      return
    } else {
      client.destroy()
      return
    }
  }
})
commands.set("help", {
  minRank: 0,
  hidden: false,
  eval: function (client, args, argsSplit) {
    let list = []
    for (let [key, value] of commands) {
      if (value.hidden) continue
      if (value.minRank > client.rank) continue
      list.push(key)
    }
    list = list.sort()
    client.sendString(`Server: ${list.join(", ")}.`)
  }
})
commands.set("tell", {
  minRank: 0,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (argsSplit.length < 2) {
      client.sendString("Usage: /tell (id) (message)")
      return
    }
    let id = parseInt(argsSplit[0])
    let target = client.world.clients.get(id)
    if (!target) {
      client.sendString("Error: User does not exist")
      return
    }
    let message = args.substring(args.indexOf(" ") + 1)
    client.sendString(`-> You tell ${id}: ${message}`)
    target.sendString(`-> ${client.uid} tells you: ${message}`)
  }
})
commands.set("modlogin", {
  minRank: 0,
  hidden: true,
  eval: function (client, args, argsSplit) {
    if (client.rank >= 2) return
    if (!args) return
    if (args !== process.env.MODLOGIN) {
      client.destroy()
      return
    }
    if (!client.world.allowGlobalMods) {
      client.sendString("Sorry, but global moderators are disabled on this world.")
      return
    }
    client.server.adminMessage(`DEV${client.uid} (${client.world.name}, ${client.ip.ip}) Got mod`)
    client.setRank(2)
  }
})
commands.set("adminlogin", {
  minRank: 0,
  hidden: true,
  eval: function (client, args, argsSplit) {
    if (client.rank >= 3) return
    if (!args) return
    if (args !== process.env.ADMINLOGIN) {
      client.destroy()
      return
    }
    client.server.adminMessage(`DEV${client.uid} (${client.world.name}, ${client.ip.ip}) Got admin`)
    client.setRank(3)
  }
})
commands.set("tp", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (argsSplit.length < 1 || argsSplit.length > 3 || argsSplit.some(string => !string.match(/^\d+$/))) {
      client.sendString("Usage: /tp [ID] or /tp X Y or /tp [ID] X Y")
      return
    }
    let argsNumbers = argsSplit.map(value => parseInt(value))
    switch (argsSplit.length) {
      case 1: {
        let id = argsNumbers[0]
        let target = client.world.clients.get(id)
        if (!target) {
          client.sendString(`No player with ID ${id}`)
          return
        }
        client.teleport(target.x, target.y)
        return
      }
      case 2: {
        let x = argsNumbers[0]
        let y = argsNumbers[1]
        if (client.rank < 3) {
          if (Math.abs(x) > client.world.maxTpDistance || Math.abs(y) > client.world.maxTpDistance) {
            client.sendString("Out of range!")
            return
          }
        }
        client.sendString(`Server: Teleported to X: ${x}, Y: ${y}`)
        client.teleport(x << 4, y << 4)
        return
      }
      case 3: {
        let id = argsNumbers[0]
        let x = argsNumbers[1]
        let y = argsNumbers[2]
        if (client.rank < 3) {
          if (Math.abs(x) > client.world.maxTpDistance || Math.abs(y) > client.world.maxTpDistance) {
            client.sendString("Out of range!")
            return
          }
        }
        let target = client.world.clients.get(id)
        if (!target) {
          client.sendString(`No player with ID ${id}`)
          return
        }
        let oldX = target.x >> 4
        let oldY = target.y >> 4
        target.teleport(x << 4, y << 4)
        client.sendString(`Server: Teleported ${id} from ${oldX}, ${oldY} to ${x}, ${y}`)
      }
    }
  }
})
commands.set("setrank", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (client.rank < 3 && client.world.simpleMods) {
      client.sendString("No setrank for you")
      return
    }
    if (argsSplit.length < 2) {
      client.sendString("Usage: /setrank (id) (rank [0: NONE, 1: USER, 2: MODERATOR, 3: ADMIN])")
      return
    }
    let id = parseInt(argsSplit[0])
    let target = client.world.clients.get(id)
    if (!target) {
      client.sendString("Error: User does not exist")
      return
    }
    let rank = parseInt(argsSplit[1])
    if (!(rank >= 0 && rank <= 3)) {
      client.sendString("Usage: /setrank (id) (rank [0: NONE, 1: USER, 2: MODERATOR, 3: ADMIN])")
      return
    }
    if (client.rank < 3) {
      if (target.rank >= client.rank) {
        client.sendString("Error: Target's rank must be less than yours.")
        return
      }
      if (rank >= client.rank) {
        client.sendString(`Error: Rank set must be less than your current rank. (${rank} >= ${client.rank})`)
        return
      }
    }
    if (target.rank === rank) {
      client.sendString(`Error: Client's rank is already ${rank}.`)
      return
    }
    target.setRank(rank)
    if (rank === 3) {
      client.server.adminMessage(`DEV${target.uid} (${target.world.name}, ${target.ip.ip}) Got admin from ${client.uid} (${client.ip.ip})`)
    } else if (rank === 2) {
      client.server.adminMessage(`DEV${target.uid} (${target.world.name}, ${target.ip.ip}) Got mod from ${client.uid} (${client.ip.ip})`)
    }
    client.sendString(`Set user's (${target.uid}) rank to: ${rank}`)
  }
})
commands.set("whois", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.sendString("Usage: /whois (Player ID)")
      return
    }
    let id = parseInt(args)
    let target = client.world.clients.get(id)
    if (!target) {
      client.sendString("Error: User does not exist")
      return
    }
    client.sendString(`Client information for: ${target.uid}`)
    client.sendString(`-> Connections by this IP: ${target.ip.clients.size}`)
    if (client.rank >= 3) {
      client.sendString(`-> IP: ${target.ip.ip}`)
    }
    client.sendString(`-> Origin header: ${target.ws.origin}`)
    client.sendString(`-> Rank: ${target.rank}`)
  }
})
commands.set("mute", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (client.rank < 3 && client.world.simpleMods) {
      client.sendString("No mute for you")
      return
    }
    if (argsSplit.length < 2) {
      client.sendString("Usage: /mute (id) (1/0)")
      return
    }
    let id = parseInt(argsSplit[0])
    let target = client.world.clients.get(id)
    if (!target) {
      client.sendString("Error: User does not exist")
      return
    }
    if (client.rank < 3 && target.rank >= client.rank) {
      client.sendString("Error: Target's rank must be less than yours.")
      return
    }
    let willMute = argsSplit[1] === "1"
    target.mute = willMute
    client.sendString(`${willMute ? "Muted" : "Unmuted"} ${target.uid}`)
  }
})
commands.set("restrict", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (client.rank < 3 && client.world.simpleMods) {
      client.sendString("No restrict for you")
      return
    }
    if (!args) {
      client.sendString("Restricts drawing to all NEW users in this world. (manually grant with /setrank (id) 1)")
      client.sendString("Usage: /restrict (true/false)")
      return
    }
    let newState = args === "true"
    client.world.setProp("restricted", newState)
    client.sendString(`Draw restriction is ${newState ? "ON" : "OFF"}`)
  }
})
commands.set("getid", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.sendString("Gets the id by nick. Make sure to include everything before the : in chat.")
      client.sendString("Usage: /getid NICKNAME")
      return
    }
    let results = []
    for (let c of client.world.clients.values()) {
      if (c.nick === args) results.push(c.uid)
    }
    if (results.length === 0) {
      client.sendString("User not found!")
      return
    }
    client.sendString(`ID: ${results.join(", ")}`)
  }
})
commands.set("kick", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (client.rank < 3 && client.world.simpleMods) {
      client.sendString("No kick for you")
      return
    }
    if (!args) {
      client.sendString("Usage: /kick ID")
      return
    }
    let id = parseInt(args)
    let target = client.world.clients.get(id)
    if (!target) {
      client.sendString("Error: User does not exist")
      return
    }
    if (client.rank < 3 && target.rank >= client.rank) {
      client.sendString("Error: Target's rank must be less than yours.")
      return
    }
    client.sendString(`Kicked user ${target.uid}`)
    target.teleport(0, 0)
    target.destroy()
  }
})
commands.set("ids", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    client.sendString(`Total: ${client.world.clients.size}; ${Array.from(client.world.clients.keys()).join(", ")}`)
  }
})
commands.set("setworldpass", {
  minRank: 2,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (client.rank < 3 && client.world.simpleMods) {
      client.sendString("No setworldpass for you")
      return
    }
    if (!args) {
      client.sendString("Use to set the password on this world.")
      client.sendString("Usage: /setworldpass (NEW-WORLD-PASSWORD | remove)")
      return
    }
    let value = args.trim()
    if (value === "remove") {
      client.sendString("World password removed!")
      client.world.setProp("pass", null)
      return
    }
    if (!value) return
    client.sendString(`-> World password set to: '${value}'`)
    client.world.setProp("pass", value)
  }
})
commands.set("stealth", {
  minRank: 3,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.sendString("Stops broadcasting your movement updates")
      client.sendString("Usage: /stealth (true, false)")
      return
    }
    let newState = args === "true"
    client.stealth = newState
    client.sendString(`Stealth mode ${newState ? "enabled" : "disabled"}.`)
  }
})
commands.set("config", {
  minRank: 3,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.sendString("Allows you to view and configure some global server properties")
      client.sendString("Usage: /config (defaultPquota/captchaSecurity/maxConnectionsPerIp/motd/appealMessage/regionloadquota) (value)")
      return
    }
    switch (argsSplit[0]) {
      case "defaultPquota": {
        if (!argsSplit[1]) {
          client.sendString(`Current default pquota: ${client.server.config.defaultPquota}`)
          client.sendString("Valid default pquota settings are in the format (amount),(seconds) - for example 48,4")
          return
        }
        if (!validateQuotaString(argsSplit[1])) {
          client.sendString("Error: Invalid pquota, make sure it follows the format (amount),(seconds) and no values are greater than 65536 or less than 0.")
          return
        }
        if (argsSplit[1] !== client.server.config.defaultPquota) client.server.adminMessage(`DEVDefault pquota set to: ${argsSplit[1]}`)
        client.server.config.defaultPquota = argsSplit[1]
        client.sendString(`Set defaultPquota to ${argsSplit[1]}`)
        break
      }
      case "captchaSecurity": {
        if (!argsSplit[1]) {
          client.sendString(`Current captcha security level: ${client.server.config.captchaSecurity}`)
          client.sendString("Valid options: 0 - no captcha, 1 - captcha once per IP, 2 - captcha always")
          return
        }
        let parsed = parseInt(argsSplit[1])
        if (!(parsed >= 0 && parsed <= 3)) {
          client.sendString("Error: Invalid captcha security level. Valid options: 0 - no captcha, 1 - captcha once per IP, 2 - captcha always")
          return
        }
        if (parsed !== client.server.config.captchaSecurity) client.server.adminMessage(`DEVCaptcha security level set to: ${parsed}`)
        client.server.config.captchaSecurity = parsed
        client.sendString(`Set captchaSecurity to ${parsed}`)
        break
      }
      case "maxConnectionsPerIp": {
        if (!argsSplit[1]) {
          client.sendString(`Current maximum connections per IP: ${client.server.config.maxConnectionsPerIp}`)
          client.sendString("Any number 1 or greater is valid.")
          return
        }
        let parsed = parseInt(argsSplit[1])
        if (!(parsed > 0)) {
          client.sendString("Error: Invalid maxConnectionsPerIp. Make sure the value is greater than 0.")
          return
        }
        if (parsed !== client.server.config.maxConnectionsPerIp) client.server.adminMessage(`DEVMax connections per IP set to: ${parsed}`)
        client.server.config.maxConnectionsPerIp = parsed
        client.sendString(`Set maxConnectionsPerIp to ${parsed}`)
        break
      }
      case "motd": {
        if (!argsSplit[1]) {
          client.sendString(`Current motd: ${client.server.config.motd}`)
          client.sendString("Any text is valid. Note that this is NOT the world's motd, this is a global motd displayed in the API.")
          return
        }
        let value = args.substring(args.indexOf(" ") + 1)
        if (value !== client.server.config.motd) client.server.adminMessage(`DEVMotd set to: ${value}`)
        client.server.config.motd = value
        client.sendString(`Set motd to '${value}'`)
        break
      }
      case "appealMessage": {
        if (!argsSplit[1]) {
          client.sendString(`Current appeal message: ${client.server.config.appealMessage}`)
          client.sendString("Any text is valid. This is displayed after ban messages.")
          return
        }
        let value = args.substring(args.indexOf(" ") + 1)
        if (value !== client.server.config.appealMessage) client.server.adminMessage(`DEVAppeal message set to: ${value}`)
        client.server.config.appealMessage = value
        client.sendString(`Set appealMessage to '${value}'`)
        break
      }
      case "regionloadquota": {
        if (!argsSplit[1]) {
          client.sendString(`Current region load quota: ${client.server.config.regionloadquota}`)
          client.sendString("This quota determines how quickly clients are able to load unloaded regions (256x256 areas). Valid region load quota settings are in the format (amount),(seconds) - for example 350,5")
          return
        }
        if (!validateQuotaString(argsSplit[1])) {
          client.sendString("Error: Invalid region load quota, make sure it follows the format (amount),(seconds) and no values are greater than 65536 or less than 0.")
          return
        }
        if (argsSplit[1] !== client.server.config.regionloadquota) client.server.adminMessage(`DEVRegion load quota set to: ${argsSplit[1]}`)
        client.server.config.regionloadquota = argsSplit[1]
        client.sendString(`Set regionloadquota to ${argsSplit[1]}`)
        break
      }
      default: {
        client.sendString("Error: Unknown property.")
      }
    }
  }
})
commands.set("kickip", {
  minRank: 3,
  hidden: false,
  eval: function (client, args, argsSplit) {
    if (!args) {
      client.sendString("Usage: /kickip IP")
      return
    }
    let target = client.server.ips.map.get(args)
    if (!target || target.constructor === Promise || target.clients.size === 0) {
      client.sendString("Error: That user is offline.")
      return
    }
    client.sendString(`Kicked IP ${target.ip}`)
    target.kick()
    client.server.adminMessage(`DEVKicked IP: ${target.ip}`)
  }
})