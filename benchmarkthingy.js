function originalCompress(data, tileX, tileY, protection) {
  // copypasted, sorry ;-;
  var result = new Uint8Array(16 * 16 * 3 + 10 + 4);
  var s = 16 * 16 * 3;
  var compressedPos = [];
  var compBytes = 3;
  var lastclr = data[2] << 16 | data[1] << 8 | data[0];
  var t = 1;
  for(var i = 3; i < data.length; i += 3) {
    var clr = data[i + 2] << 16 | data[i + 1] << 8 | data[i];
    compBytes += 3;
    if(clr == lastclr) { ++t } else {
      if(t >= 3) {
        compBytes -= t * 3 + 3;
        compressedPos.push({
          pos: compBytes,
          length: t
        });
        compBytes += 5 + 3;
      }
      lastclr = clr;
      t = 1;
    }
  }
  if(t >= 3) {
    compBytes -= t * 3;
    compressedPos.push({
      pos: compBytes,
      length: t
    });
    compBytes += 5;
  }
  var totalcareas = compressedPos.length;
  var msg = new DataView(result.buffer);
  msg.setUint8(0, 2);
  msg.setInt32(1, tileX, true);
  msg.setInt32(5, tileY, true);
  msg.setUint8(9, protection);

  var curr = 10; // as unsigned8 (current position in output buffer)

  msg.setUint16(curr, s, true);
  curr += 2; // size of unsigned 16 bit ints

  msg.setUint16(curr, totalcareas, true);

  curr += 2; // uint16 size

  for(var i = 0; i < compressedPos.length; i++) {
    var point = compressedPos[i];
    msg.setUint16(curr, point.pos, true)
    curr += 2; // uint16 size
  }

  var di = 0; //(data index)
  var ci = 0; //(compressed index)
  for(var i = 0; i < compressedPos.length; i++) {
    var point = compressedPos[i];
    while(ci < point.pos) {
      msg.setUint8(curr + (ci++), data[di++]);
    }
    msg.setUint16(curr + ci, point.length, true);
    ci += 2; // uint16 size
    msg.setUint8(curr + (ci++), data[di++]);
    msg.setUint8(curr + (ci++), data[di++]);
    msg.setUint8(curr + (ci++), data[di++]);
    di += point.length * 3 - 3;
  }
  while(di < s) {
    msg.setUint8(curr + (ci++), data[di++]);
  }
  var size = compBytes + totalcareas * 2 + 10 + 2 + 2;
  return result.slice(0, size);
}

let primaryBuffer = Buffer.allocUnsafeSlow(182)
primaryBuffer[0] = 0x02
primaryBuffer.writeUint16LE(768, 10)
let secondaryBuffer = Buffer.allocUnsafeSlow(768)

function goodCompress(data, tileX, tileY, protection) {
  primaryBuffer.writeInt32LE(tileX, 1)
  primaryBuffer.writeInt32LE(tileY, 5)
  primaryBuffer[9] = protection
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

let data = Buffer.alloc(768, new Uint8Array([255,255,255]))
//let data = Buffer.alloc(768, 0x55)

let total = 0
console.time()
for (let i = 100000; i--;) {
  total += goodCompress(data, 0, 0, 0).byteLength
}
console.timeEnd()
console.log(total)


total = 0
console.time()
for (let i = 100000; i--;) {
  total += originalCompress(data, 0, 0, 0).length
}
console.timeEnd()
console.log(total)

console.log(Buffer.from(goodCompress(data, 0, 0, 0)).equals(Buffer.from(originalCompress(data, 0, 0, 0))))

/*
let res = originalCompress(data, 0, 0, 0)
for (let i = 0; i < res.length; i++) {
  console.log(i, res[i].toString(16).padStart(2, "0"))
}
*/