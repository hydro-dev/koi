/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from 'fs'
import glob from 'glob'
import type * as Fs from 'fs'
import type * as Child from 'child_process'
import { chmod, emptyDir, remove, writeFile } from 'fs-extra'
import { series } from 'gulp'
import mkdirp from 'mkdirp'
import { resolve } from './path'
import { exists, spawnAsync } from './utils'

export async function createInstance() {
  const dir = resolve('.', 'instance')
  await mkdirp(dir)
  const oldDir = process.cwd()
  process.chdir(dir)
  await writeFile(
    resolve('package.json', 'instance'),
    JSON.stringify({
      name: 'hydro-install',
      private: true,
      version: '1.0.0',
      license: 'MIT',
      workspaces: ['plugins/**'],
      scripts: {
        start: 'hydrooj',
      },
    })
  )
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    await writeFile(
      resolve('.yarnrc.yml', 'instance'),
      'httpsProxy: "' +
        (process.env.HTTPS_PROXY || process.env.https_proxy) +
        '"'
    )
  }
  await writeFile(resolve('yarn.lock', 'instance'), '')
  const tasks = [
    'yarn set version berry',
    'yarn config set nodeLinker node-modules',
    'yarn plugin import workspace-tools',
    'yarn add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge',
    'yarn workspaces focus --production --all',
  ]
  for (const task of tasks) {
    const args = task.split(' ')
    await spawnAsync(args[0], args.slice(1), { cwd: dir })
  }
  process.chdir(oldDir)
}

async function main() {
  console.log('Hydro Setup Tool')
  const child: typeof Child = require('child_process')
  const fs: typeof Fs = require('fs')
  const cwd = __dirname + '/hydro'
  process.chdir(cwd)
  async function runYarn(args: string[]) {
    const p = child.spawn('yarn', args, {
      stdio: 'inherit',
    })
    await new Promise<void>((resolve, reject) => {
      p.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(code)
        }
      })
    })
  }
  await runYarn(['workspaces', 'focus', '--production', '--all'])
  await runYarn(['start'])
}

async function globClean(pattern: string) {
  const extra = await new Promise<string[]>((res) =>
    glob(resolve('.', 'dist') + '/' + pattern, (err, files) => res(files))
  )
  await Promise.all(
    extra
      .filter((i) => !i.includes('/hydrooj/') && !i.includes('/@hydrooj/'))
      .map((file) => remove(file))
  )
}

export async function cleanupInstance(): Promise<void> {
  const files = [
    'node/lib/node_modules/npm',
    'node/lib/node_modules/corepack',
    'node/bin/corepack',
    'node/bin/npm',
    'node/bin/npx',
    'node/share',
    'node/include',
  ]
  await Promise.all(files.map((file) => remove(resolve(file, 'dist'))))
  await Promise.all(
    [
      '**/{README,README.*,HISTORY,SECURITY,CHANGELOG,CONTRIBUTING}.md',
      '**/*.{styl,scss,bak,ts,d.ts,png,js.map,html,umd.js,gif,.test.js}',
      '**/.{travis.yml,tsconfig.json,editorconfig}',
      '**/{Makefile,yarn.lock,package-lock.json,bower.json}',
      '**/.*{ignore,rc}',
      '**/.*rc.{yaml,js,yml,json}',
      '**/{.github,.vscode,test,example,examples,coverage}/**',
    ].map(globClean)
  )
  const [filename] = fs.readdirSync(resolve('.yarn/releases', 'instance'))
  const cwd = process.cwd()
  process.chdir(resolve('./node/bin', 'dist'))
  if (!(await exists('yarn')))
    fs.symlinkSync(`../../hydro/.yarn/releases/${filename}`, 'yarn')
  process.chdir(cwd)
  await emptyDir(resolve('home', 'dist'))
  await emptyDir(resolve('tmp', 'dist'))
  await writeFile(
    resolve('h.js', 'dist'),
    '#!./node/bin/node\n' + main.toString() + 'main()'
  )
  await chmod(resolve('h.js', 'dist'), 0o755)
  const target = 'Hydro.zip'
  const oldSize = fs.existsSync(target) ? fs.statSync(target).size : 0
  await remove(target)
  await spawnAsync('zip', ['-r', '-9', target, 'build'])
  const newSize = fs.statSync(target).size
  console.log(
    `Compressed size: ${Math.floor((oldSize / 1024 / 1024) * 1000) / 1000} -> ${
      Math.floor((newSize / 1024 / 1024) * 1000) / 1000
    } MiB (${(newSize / oldSize) * 100}%)`
  )
}

export const build = series(createInstance, cleanupInstance)
