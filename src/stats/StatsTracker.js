export class StatsTracker {
  constructor(server) {
    this.server = server
    
    this.startTime = performance.now()
    this.totalConnections = 0
    this.numSelfBans = 0
    this.currentPixelsPlaced = 0
    this.lastPushOn = Date.now()
    this.pixelsPlacedPerHour = []
  }

  tickPixels() {
    this.pixelsPlacedPerHour.push(this.currentPixelsPlaced)
    this.currentPixelsPlaced = 0
  }
}