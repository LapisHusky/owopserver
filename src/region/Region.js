import { loadProtection, loadPixels, saveData } from "./regionData.js"

let primaryBuffer = Buffer.allocUnsafeSlow(184)
primaryBuffer[0] = 0x02
primaryBuffer.writeUint16LE(768, 10)
let secondaryBuffer = Buffer.allocUnsafeSlow(768)

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
    this.modified = false

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
      this.pixels = Buffer.alloc(196608, new Uint8Array([(color & 0xff0000) >> 16, (color & 0x00ff00) >> 8, color & 0x0000ff]))
      this.protection = Buffer.alloc(256)
      return
    }
    this.protection = loadProtection(data.subarray(0, 32))
    this.pixels = loadPixels(data.subarray(32))
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    if (this.modified) {
      this.server.regions.setData(this.dbId, saveData(this.protection, this.pixels))
    }
    this.world.regionDestroyed(this.id)
  }

  keepAlive(tick) {
    return tick - this.lastHeld < 150
  }

  getChunkData(chunkLocation) {
    let data = this.pixels.subarray(chunkLocation * 768, chunkLocation * 768 + 768)
    let relativeChunkX = chunkLocation & 0x0f
    let relativeChunkY = (chunkLocation & 0xf0) >> 4
    primaryBuffer.writeInt32LE((this.x << 4) + relativeChunkX, 1)
    primaryBuffer.writeInt32LE((this.y << 4) + relativeChunkY, 5)
    primaryBuffer[9] = this.protection[chunkLocation]
    let pBufIndex = 14
    let sBufIndex = 0
    let lastColor = data[2] << 16 | data[1] << 8 | data[0]
    let repeat = 1
    for (let i = 3; i < 768; i += 3) {
      let color = data[i + 2] << 16 | data[i + 1] << 8 | data[i]
      if (color === lastColor) {
        repeat++
      } else {
        if (repeat >= 3) {
          primaryBuffer.writeUint16LE(sBufIndex, pBufIndex)
          pBufIndex += 2
          secondaryBuffer.writeUint16LE(repeat, sBufIndex)
          sBufIndex += 2
          secondaryBuffer[sBufIndex++] = data[i - 3]
          secondaryBuffer[sBufIndex++] = data[i - 2]
          secondaryBuffer[sBufIndex++] = data[i - 1]
        } else {
          let bytes = 3 * repeat
          let start = i - bytes
          for (let j = start; j < i; j++) {
            secondaryBuffer[sBufIndex++] = data[j]
          }
        }
        repeat = 1
        lastColor = color
      }
    }
    if (repeat >= 3) {
      primaryBuffer.writeUint16LE(sBufIndex, pBufIndex)
      pBufIndex += 2
      secondaryBuffer.writeUint16LE(repeat, sBufIndex)
      sBufIndex += 2
      secondaryBuffer[sBufIndex++] = data[765]
      secondaryBuffer[sBufIndex++] = data[766]
      secondaryBuffer[sBufIndex++] = data[767]
    } else {
      let bytes = 3 * repeat
      let start = 768 - bytes
      for (let j = start; j < 768; j++) {
        secondaryBuffer[sBufIndex++] = data[j]
      }
    }
    primaryBuffer.writeUint16LE((pBufIndex - 14) / 2, 12)
    let out = Buffer.allocUnsafeSlow(pBufIndex + sBufIndex)
    primaryBuffer.copy(out)
    secondaryBuffer.copy(out, pBufIndex)
    return out
  }

  requestChunk(client, chunkLocation) {
    client.ws.send(this.getChunkData(chunkLocation).buffer, true)
  }

  setPixel(client, x, y, r, g, b) {
    let chunkId = (y & 0xf0) + ((x & 0xf0) >> 4)
    if (client.rank < 2 && this.protection[chunkId]) return
    let chunkRelativePos = ((y & 0xf) << 4) + (x & 0xf)
    let bufferPos = ((chunkId << 8) | chunkRelativePos) * 3
    if (this.pixels[bufferPos] === r && this.pixels[bufferPos + 1] === g && this.pixels[bufferPos + 2] === b) return
    if (this.world.pixelUpdates.length >= 65536) return
    this.server.stats.currentPixelsPlaced++
    this.pixels[bufferPos] = r
    this.pixels[bufferPos + 1] = g
    this.pixels[bufferPos + 2] = b
    this.modified = true
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
    this.modified = true
    data.copy(this.pixels, chunkLocation * 768)
    this.world.broadcastBuffer(this.getChunkData(chunkLocation))
  }

  eraseChunk(chunkLocation, r, g, b) {
    this.modified = true
    this.pixels.fill(new Uint8Array([r, g, b]), chunkLocation * 768, chunkLocation * 768 + 768)
    let buffer = Buffer.allocUnsafeSlow(21)
    erasedChunkTemplate.copy(buffer)
    let relativeChunkX = chunkLocation & 0x0f
    let relativeChunkY = (chunkLocation & 0xf0) >> 4
    buffer.writeInt32LE((this.x << 4) + relativeChunkX, 1)
    buffer.writeInt32LE((this.y << 4) + relativeChunkY, 5)
    buffer[9] = this.protection[chunkLocation]
    buffer[18] = r
    buffer[19] = g
    buffer[20] = b
    this.world.broadcastBuffer(buffer)
  }

  protectChunk(chunkLocation, isProtected) {
    this.modified = true
    this.protection[chunkLocation] = isProtected
    let buffer = Buffer.allocUnsafeSlow(10)
    buffer[0] = 0x07
    let relativeChunkX = chunkLocation & 0x0f
    let relativeChunkY = (chunkLocation & 0xf0) >> 4
    buffer.writeInt32LE((this.x << 4) + relativeChunkX, 1)
    buffer.writeInt32LE((this.y << 4) + relativeChunkY, 5)
    buffer[9] = isProtected
    this.world.broadcastBuffer(buffer)
  }
}