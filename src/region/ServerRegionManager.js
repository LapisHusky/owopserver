import { Level } from "level"
import { Cache } from "../util/dbCache.js"

export class ServerRegionManager {
  constructor(server) {
    this.server = server
    this.db = new Level("./data/regions", {
      keyEncoding: "utf8",
      valueEncoding: "buffer"
    })
    this.dbCache = new Cache(10000, this.dbGetter.bind(this), this.dbSetter.bind(this))

    this.destroyed = false
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
    await this.dbCache.saveAll()
    this.db.close()
  }

  getData(dbId) {
    return this.dbCache.get(dbId)
  }

  setData(dbId, data) {
    this.dbCache.set(dbId, data)
  }
}