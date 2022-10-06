import fs from "fs/promises"

export let data
try {
  data = await fs.readFile("./data/misc.json")
  data = JSON.parse(data)
} catch (error) {
  data = {
    whitelistId: 0
  }
}

async function save() {
  try {
    await fs.writeFile("./data/misc.json", JSON.stringify(data))
  } catch (error) {
    console.log(error)
  }
}

let savePromise = null

let saveInterval = setInterval(async () => {
  savePromise = save()
  await savePromise
  savePromise = null
}, 120000)

export async function saveAndClose() {
  clearInterval(saveInterval)
  if (savePromise) await savePromise
  await save()
}