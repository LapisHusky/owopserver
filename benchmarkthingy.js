let total = 0
for (let i = 1000000000; i--;) {
  total++
}
console.time()
for (let i = 10000; i--;) {
  try {
    total++
    throw new Error()
  } catch (error) {
    //console.log(error)
  }
}
console.timeEnd()
console.time()
for (let i = 1000000000; i--;) {
  total++
}
console.timeEnd()