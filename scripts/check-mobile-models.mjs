import fs from 'node:fs'
import assert from 'node:assert/strict'

function inspect(file) {
  const fd = fs.openSync(file, 'r')
  const header = Buffer.alloc(20)
  fs.readSync(fd, header, 0, 20, 0)
  const json = Buffer.alloc(header.readUInt32LE(12))
  fs.readSync(fd, json, 0, json.length, 20)
  fs.closeSync(fd)
  const doc = JSON.parse(json.toString())
  return {
    bytes: fs.statSync(file).size,
    vertices: (doc.meshes || []).flatMap(m => m.primitives).reduce((sum, p) => sum + doc.accessors[p.attributes.POSITION].count, 0),
    nodes: (doc.nodes || []).map(n => n.name).filter(Boolean),
    animations: (doc.animations || []).map(a => ({ name: a.name, duration: Math.max(...a.samplers.map(s => doc.accessors[s.input].max?.[0] || 0)) })),
    joints: [...new Set((doc.skins || []).flatMap(s => s.joints.map(i => doc.nodes[i].name)))].sort(),
  }
}

for (const name of ['character_v02', 'character_scared_v03', 'character_motion', 'shovel']) {
  const original = inspect(`public/models/${name}.glb`)
  const mobile = inspect(`public/models-mobile/${name}.glb`)
  assert(mobile.bytes < original.bytes, `${name}: file did not shrink`)
  assert(mobile.vertices < original.vertices, `${name}: geometry did not shrink`)
  assert.deepEqual(mobile.animations.map(a => a.name), original.animations.map(a => a.name), `${name}: animation names changed`)
  mobile.animations.forEach((a, i) => assert(Math.abs(a.duration - original.animations[i].duration) < .00001, `${name}: animation duration changed`))
  assert.deepEqual(mobile.joints, original.joints, `${name}: skeleton joints changed`)
  for (const node of original.nodes) assert(mobile.nodes.includes(node), `${name}: missing node ${node}`)
  console.log(JSON.stringify({ name, originalMiB: +(original.bytes / 1048576).toFixed(2), mobileMiB: +(mobile.bytes / 1048576).toFixed(2), originalVertices: original.vertices, mobileVertices: mobile.vertices, animations: mobile.animations, preservedNamedNodes: original.nodes.length }))
}
