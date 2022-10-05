import { commands } from "./commands.js"

export function handleCommand(client, message) {
  message = message.substring(1)
  let split = message.split(" ")
  let cmdBase = split[0]
  let command = commands.get(cmdBase)
  if (!command) return
  if (client.rank < command.minRank) return
  let args
  if (split.length > 1) {
    args = message.substring(message.indexOf(" ") + 1)
  } else {
    args = ""
  }
  let argsSplit = split.slice(1)
  command.eval(client, args, argsSplit)
}