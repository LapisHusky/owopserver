import { Level } from "level"
import { Cache } from "../util/dbCache.js"
import { World } from "./World.js"

export class ServerWorldManager {
  constructor(server) {
    this.server = server
    this.map = new Map()
    this.db = new Level("./data/worlds", {
      keyEncoding: "utf8",
      valueEncoding: "utf8"
    })
    this.dbCache = new Cache(10000, this.dbGetter.bind(this), this.dbSetter.bind(this))

    this.destroyed = false
  }

  async fetch(world) {
    if (this.map.has(world)) return this.map.get(world)
    let promise, resolve
    promise = new Promise(res => resolve = res)
    this.map.set(world, promise)
    let worldData = await this.dbCache.get(world)
    let worldObject = new World(this, world, worldData)
    this.map.set(world, worldObject)
    resolve(worldObject)
    return worldObject
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
    for (let world of this.map.values()) {
      if (world.constructor !== World) continue
      world.destroy()
    }
    await this.dbCache.saveAll()
    this.db.close()
  }

  worldDestroyed(worldObject, data) {
    let world = worldObject.name
    this.map.delete(world)
    if (data) this.dbCache.set(world, data)
  }

  tickExpiration(tick) {
    for (let worldObject of this.map.values()) {
      //ignore promises
      if (worldObject.constructor !== World) continue
      if (!worldObject.keepAlive(tick)) worldObject.destroy()
      worldObject.tickExpiration(tick)
    }
  }

  tick(tick) {
    for (let worldObject of this.map.values()) {
      //ignore promises
      if (worldObject.constructor !== World) continue
      worldObject.tick(tick)
    }
  }
}