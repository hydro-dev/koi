export * from './build'
export * from './prepareNode'
import { remove } from 'fs-extra'
import { series } from 'gulp'
import mkdirp from 'mkdirp'
import { build } from './build'
import { resolve } from './path'
import { prepareNode } from './prepareNode'

export function clean() {
  return remove(resolve('.', 'dist'))
}

export async function mkdir(): Promise<void> {
  await mkdirp(resolve('.', 'cache'))
  await mkdirp(resolve('home', 'dist'))
  await mkdirp(resolve('node', 'dist'))
  await mkdirp(resolve('tmp', 'dist'))
  await mkdirp(resolve('.', 'instance'))
}

export const dev = series(mkdir, prepareNode, build)

export const all = series(clean, dev)

export default dev
