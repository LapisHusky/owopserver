import { deflateRawSync, inflateRawSync } from "zlib"

export function loadData(region, data) {
  data = inflateRawSync(data)

  //protection
  let protectionData = Buffer.allocUnsafe(256)
  for (let i = 0; i < 32; i++) {
    let protectionIndex = i * 8
    protectionData[protectionIndex] = (data[i] & 0b10000000) >> 7
    protectionData[protectionIndex + 1] = (data[i] & 0b01000000) >> 6
    protectionData[protectionIndex + 2] = (data[i] & 0b00100000) >> 5
    protectionData[protectionIndex + 3] = (data[i] & 0b00010000) >> 4
    protectionData[protectionIndex + 4] = (data[i] & 0b00001000) >> 3
    protectionData[protectionIndex + 5] = (data[i] & 0b00000100) >> 2
    protectionData[protectionIndex + 6] = (data[i] & 0b00000010) >> 1
    protectionData[protectionIndex + 7] = (data[i] & 0b00000001)
  }
  region.protection = protectionData

  //pixels
  data = data.subarray(32)
  const result = Buffer.allocUnsafe(196608)

  let arrayPosition = 0

  const index = Buffer.alloc(384)

  let red = 0
  let green = 0
  let blue = 0

  const chunksLength = data.length

  let run = 0
  let pixelPosition = 0

  for (; pixelPosition < 196608; pixelPosition += 3) {
    mainChecks: {
      if (run > 0) {
        run--
        break mainChecks
      }
      changingChecks: {
        if (arrayPosition === chunksLength) break changingChecks
        const byte1 = data[arrayPosition++]

        if (byte1 === 0b11111111) { // QOI_OP_RGB
          red = data[arrayPosition++]
          green = data[arrayPosition++]
          blue = data[arrayPosition++]
          break changingChecks
        }
        if ((byte1 & 0b10000000) === 0b00000000) { // QOI_OP_INDEX
          red = index[byte1 * 3]
          green = index[byte1 * 3 + 1]
          blue = index[byte1 * 3 + 2]
          break changingChecks
        }
        if ((byte1 & 0b11100000) === 0b10000000) { // QOI_OP_LUMA
          const byte2 = data[arrayPosition++]
          const greenDiff = (byte1 & 0b00011111) - 16
          const redDiff = greenDiff + ((byte2 >> 4) & 0b00001111) - 8
          const blueDiff = greenDiff + (byte2 & 0b00001111) - 8

          // handle wraparound
          red = (red + redDiff + 256) % 256
          green = (green + greenDiff + 256) % 256
          blue = (blue + blueDiff + 256) % 256
          break changingChecks
        }
        if ((byte1 & 0b11000000) === 0b11000000) { // QOI_OP_RUN
          run = byte1 & 0b00111111
          break changingChecks
        }
        if ((byte1 & 0b11100000) === 0b10100000) { //above
          red = result[pixelPosition - 48]
          green = result[pixelPosition - 47]
          blue = result[pixelPosition - 46]
        }
      }

      const indexPosition = ((red * 3 + green * 5 + blue * 7) % 128) * 3
      index[indexPosition] = red
      index[indexPosition + 1] = green
      index[indexPosition + 2] = blue
    }

    result[pixelPosition] = red
    result[pixelPosition + 1] = green
    result[pixelPosition + 2] = blue
  }

  region.pixels = result
}

export function saveData(protection, pixels) {
  let red = 0
  let green = 0
  let blue = 0
  let prevRed = red
  let prevGreen = green
  let prevBlue = blue

  let run = 0
  let p = 32

  const result = Buffer.allocUnsafe(262176)
  for (let i = 0; i < 32; i++) {
    let protectionIndex = i * 8
    result[i] = (protection[protectionIndex] << 7) | (protection[protectionIndex + 1] << 6) | (protection[protectionIndex + 2] << 5) | (protection[protectionIndex + 3] << 4)
    | (protection[protectionIndex + 4] << 3) | (protection[protectionIndex + 5] << 2) | (protection[protectionIndex + 6] << 1) | (protection[protectionIndex + 7])
  }
  const index = Buffer.alloc(384)

  for (let pixelPos = 0; pixelPos < 196608; pixelPos += 3) {
    red = pixels[pixelPos]
    green = pixels[pixelPos + 1]
    blue = pixels[pixelPos + 2]

    mainChecks: {
      if (prevRed === red && prevGreen === green && prevBlue === blue) {
        run++
        break mainChecks
      }
      while (run > 0) {
        // QOI_OP_RUN
        result[p++] = 0b11000000 | (Math.min(63, run) - 1)
        run = Math.max(0, run - 63)
      }

      const indexPosition = ((red * 3 + green * 5 + blue * 7) % 128) * 3

      if (index[indexPosition] === red && index[indexPosition + 1] === green && index[indexPosition + 2] === blue) {
        //this pixel is in the recent color palette, we can just encode a reference to it
        result[p++] = indexPosition / 3
        break mainChecks
      }
      index[indexPosition] = red
      index[indexPosition + 1] = green
      index[indexPosition + 2] = blue

      if (pixelPos > 47 && pixels[pixelPos - 48] === red && pixels[pixelPos - 47] === green && pixels[pixelPos - 46] === blue) {
        //this pixel is the same as the above pixel
        result[p++] = 0b10100000
        break mainChecks
      }

      // ternary with bitmask handles the wraparound
      let vr = red - prevRed
      vr = vr & 0b10000000 ? (vr - 256) % 256 : (vr + 256) % 256
      let vg = green - prevGreen
      vg = vg & 0b10000000 ? (vg - 256) % 256 : (vg + 256) % 256
      let vb = blue - prevBlue
      vb = vb & 0b10000000 ? (vb - 256) % 256 : (vb + 256) % 256

      const vg_r = vr - vg
      const vg_b = vb - vg

      if (vg_r > -9 && vg_r < 8 && vg > -17 && vg < 16 && vg_b > -9 && vg_b < 8) {
        // QOI_OP_LUMA
        result[p++] = 0b10000000 | (vg + 16)
        result[p++] = (vg_r + 8) << 4 | (vg_b + 8)
        break mainChecks
      }
      // QOI_OP_RGB
      result[p++] = 0b11111111
      result[p++] = red
      result[p++] = green
      result[p++] = blue
    }

    prevRed = red
    prevGreen = green
    prevBlue = blue
  }

  // return a Buffer trimmed to the correct length
  return deflateRawSync(result.subarray(0, p))
}