let primaryBuffer = Buffer.allocUnsafeSlow(184)
primaryBuffer[0] = 0x02
primaryBuffer.writeUint16LE(768, 10)
let secondaryBuffer = Buffer.allocUnsafeSlow(768)

function originalCompress(data) {
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

let data = Buffer.alloc(768, new Uint8Array([1,2,3,1,2,3,1,2,3,4,5,6,4,5,6,4,5,6]))
console.time()
for (let i = 100000; i--;) {
  originalCompress(data)
}
console.timeEnd()