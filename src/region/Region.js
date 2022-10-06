import { loadProtection, loadPixels, saveData } from "./regionData.js"

let chunkBufferA = Buffer.allocUnsafeSlow(184)
chunkBufferA[0] = 0x02
chunkBufferA.writeUint16LE(768, 10)
let chunkBufferB = Buffer.allocUnsafeSlow(768)

let erasedChunkTemplate = Buffer.from("020000000000000000000003010000000001000000", "hex")

export class Region {
  constructor(world, id) {
    this.world = world
    this.server = world.server
    this.x = id % 0x20000 - 0x10000
    this.y = Math.floor(id / 0x20000) - 0x10000
    this.id = id
    this.dbId = `${world.name}-${id}`
    this.loaded = false
    this.beganLoading = false
    this.pixels = null
    this.protection = null
    this.lastHeld = this.server.currentTick
    this.loadPromise = null
    this.dataModified = false

    this.destroyed = false
  }

  load() {
    this.loadPromise = this.internalLoad()
  }

  async internalLoad() {
    this.beganLoading = true
    let data = await this.server.regions.getData(this.dbId)
    this.loaded = true
    this.loadPromise = null
    if (!data) {
      let color = this.world.bgcolor
      this.pixels = Buffer.alloc(196608, new Uint8Array([color >> 16, (color & 0x00ff00) >> 8, color & 0x0000ff]))
      this.protection = Buffer.alloc(256)
      return
    }
    this.protection = loadProtection(data.subarray(0, 32))
    this.pixels = loadPixels(data.subarray(32))
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    if (this.dataModified) {
      this.server.regions.setData(this.dbId, saveData(this.protection, this.pixels))
    }
    this.world.regionDestroyed(this.id)
  }

  keepAlive(tick) {
    if (!this.loaded) return true
    if (this.dataModified) return tick - this.lastHeld < 450
    return tick - this.lastHeld < 150
  }

  getChunkData(chunkLocation) {
    let data = this.pixels.subarray(chunkLocation * 768, chunkLocation * 768 + 768)
    let relativeChunkX = chunkLocation & 0x0f
    let relativeChunkY = chunkLocation >> 4
    chunkBufferA.writeInt32LE((this.x << 4) + relativeChunkX, 1)
    chunkBufferA.writeInt32LE((this.y << 4) + relativeChunkY, 5)
    chunkBufferA[9] = this.protection[chunkLocation]
    let aBufIndex = 14
    let bBufIndex = 0
    let lastColor = data[2] << 16 | data[1] << 8 | data[0]
    let repeat = 1
    for (let i = 3; i < 768; i += 3) {
      let color = data[i + 2] << 16 | data[i + 1] << 8 | data[i]
      if (color === lastColor) {
        repeat++
      } else {
        if (repeat >= 3) {
          chunkBufferA.writeUint16LE(bBufIndex, aBufIndex)
          aBufIndex += 2
          chunkBufferB.writeUint16LE(repeat, bBufIndex)
          bBufIndex += 2
          chunkBufferB[bBufIndex++] = data[i - 3]
          chunkBufferB[bBufIndex++] = data[i - 2]
          chunkBufferB[bBufIndex++] = data[i - 1]
        } else {
          let bytes = 3 * repeat
          let start = i - bytes
          for (let j = start; j < i; j++) {
            chunkBufferB[bBufIndex++] = data[j]
          }
        }
        repeat = 1
        lastColor = color
      }
    }
    if (repeat >= 3) {
      chunkBufferA.writeUint16LE(bBufIndex, aBufIndex)
      aBufIndex += 2
      chunkBufferB.writeUint16LE(repeat, bBufIndex)
      bBufIndex += 2
      chunkBufferB[bBufIndex++] = data[765]
      chunkBufferB[bBufIndex++] = data[766]
      chunkBufferB[bBufIndex++] = data[767]
    } else {
      let bytes = 3 * repeat
      let start = 768 - bytes
      for (let j = start; j < 768; j++) {
        chunkBufferB[bBufIndex++] = data[j]
      }
    }
    chunkBufferA.writeUint16LE((aBufIndex - 14) / 2, 12)
    let out = Buffer.allocUnsafeSlow(aBufIndex + bBufIndex)
    chunkBufferA.copy(out)
    chunkBufferB.copy(out, aBufIndex)
    return out
  }

  requestChunk(client, chunkLocation) {
    this.lastHeld = this.server.currentTick
    client.ws.send(this.getChunkData(chunkLocation).buffer, true)
  }

  setPixel(client, x, y, r, g, b) {
    this.lastHeld = this.server.currentTick
    let chunkId = (y & 0xf0) + (x >> 4)
    if (client.rank < 2 && this.protection[chunkId]) return
    let chunkRelativePos = ((y & 0xf) << 4) + (x & 0xf)
    let bufferPos = ((chunkId << 8) | chunkRelativePos) * 3
    if (this.pixels[bufferPos] === r && this.pixels[bufferPos + 1] === g && this.pixels[bufferPos + 2] === b) return
    if (this.world.pixelUpdates.length >= 65536) return
    this.server.stats.currentPixelsPlaced++
    this.pixels[bufferPos] = r
    this.pixels[bufferPos + 1] = g
    this.pixels[bufferPos + 2] = b
    this.dataModified = true
    let realX = this.x * 256 + x
    let realY = this.y * 256 + y
    let buffer = Buffer.allocUnsafe(15)
    buffer.writeUint32LE(client.uid, 0)
    buffer.writeInt32LE(realX, 4)
    buffer.writeInt32LE(realY, 8)
    buffer[12] = r
    buffer[13] = g
    buffer[14] = b
    this.world.pixelUpdates.push(buffer)
  }

  pasteChunk(chunkLocation, data) {
    this.lastHeld = this.server.currentTick
    this.dataModified = true
    data.copy(this.pixels, chunkLocation * 768)
    this.world.broadcastBuffer(this.getChunkData(chunkLocation))
  }

  eraseChunk(chunkLocation, r, g, b) {
    this.lastHeld = this.server.currentTick
    this.dataModified = true
    this.pixels.fill(new Uint8Array([r, g, b]), chunkLocation * 768, chunkLocation * 768 + 768)
    let buffer = Buffer.allocUnsafeSlow(21)
    erasedChunkTemplate.copy(buffer)
    let relativeChunkX = chunkLocation & 0x0f
    let relativeChunkY = chunkLocation >> 4
    buffer.writeInt32LE((this.x << 4) + relativeChunkX, 1)
    buffer.writeInt32LE((this.y << 4) + relativeChunkY, 5)
    buffer[9] = this.protection[chunkLocation]
    buffer[18] = r
    buffer[19] = g
    buffer[20] = b
    this.world.broadcastBuffer(buffer)
  }

  protectChunk(chunkLocation, isProtected) {
    this.lastHeld = this.server.currentTick
    this.dataModified = true
    this.protection[chunkLocation] = isProtected
    let buffer = Buffer.allocUnsafeSlow(10)
    buffer[0] = 0x07
    let relativeChunkX = chunkLocation & 0x0f
    let relativeChunkY = chunkLocation >> 4
    buffer.writeInt32LE((this.x << 4) + relativeChunkX, 1)
    buffer.writeInt32LE((this.y << 4) + relativeChunkY, 5)
    buffer[9] = isProtected
    this.world.broadcastBuffer(buffer)
  }
}