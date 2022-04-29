/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from 'fs'
import { glob } from 'glob'
import type * as Fs from 'fs'
import type * as Child from 'child_process'
import { chmod, emptyDir, remove, rename, writeFile } from 'fs-extra'
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
  if (
    process.env.ALL_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy
  ) {
    await writeFile(
      resolve('.yarnrc.yml', 'instance'),
      'httpsProxy: "' +
        (process.env.ALL_PROXY ||
          process.env.HTTPS_PROXY ||
          process.env.https_proxy) +
        '"'
    )
  }
  await writeFile(resolve('yarn.lock', 'instance'), '')
  const tasks = [
    'yarn set version berry',
    'yarn config set nodeLinker node-modules',
    'yarn plugin import workspace-tools',
    'yarn add pm2 hydrooj @hydrooj/ui-default @hydrooj/hydrojudge',
    // 'yarn workspaces focus --production --all', FIXME
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
  const sleep = (timeountMS: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, timeountMS)
    })
  function randomString(length: number) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let result = ''
    for (let i = length; i > 0; --i)
      result += chars[Math.floor(Math.random() * chars.length)]
    return result
  }
  async function run(args: string[], yarn = true, env = {}) {
    const p = child.spawn(
      yarn ? 'yarn' : args[0],
      yarn ? args : args.splice(1),
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          HOME: __dirname + '/home',
          ...env,
        },
      }
    )
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
  if (!(process.argv.length > 2)) {
    if (!fs.existsSync('.installed')) {
      console.log('Hydro is not installed, installing...')
      const MINIO_ACCESS_KEY = randomString(32)
      const MINIO_SECRET_KEY = randomString(32)
      const DATABASE_PASSWORD = randomString(32)
      fs.writeFileSync(
        __dirname + '/home/.hydro/env',
        `MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}\nMINIO_SECRET_KEY=${MINIO_SECRET_KEY}`
      )
      fs.writeFileSync(
        __dirname + '/home/.hydro/addon.json',
        '["@hydrooj/ui-default","@hydrooj/hydrojudge"]'
      )
      fs.writeFileSync(
        '/tmp/createUser.js',
        `\
                  db.createUser({
                    user: 'hydro',
                    pwd: '${DATABASE_PASSWORD}',
                    roles: [{ role: 'readWrite', db: 'hydro' }]
                })`
      )
      fs.writeFileSync(
        __dirname + '/home/.hydro/config.json',
        JSON.stringify({
          host: '127.0.0.1',
          port: 27017,
          name: 'hydro',
          username: 'hydro',
          password: DATABASE_PASSWORD,
        })
      )
      await run(
        `pm2 start ../mongodb/bin/mongod -- --bind_ip 127.0.0.1`.split(' ')
      )
      await sleep(5000)
      await run(
        (
          __dirname +
          '/mongodb/bin/mongo 127.0.0.1:27017/hydro /tmp/createUser.js'
        ).split(' '),
        false
      )
      await run(`pm2 del 0`.split(' '))
      await run(
        'pm2 start ../minio/bin/minio -- server /data/file --name minio'.split(
          ' '
        ),
        true,
        {
          MINIO_ACCESS_KEY: MINIO_ACCESS_KEY,
          MINIO_SECRET_KEY: MINIO_SECRET_KEY,
        }
      )
      const operations = [
        'pm2 start ../minio -- server /data/file --name minio', //need token
        'pm2 start ../mongodb/bin/mongod --name mongodb -- --auth --bind_ip 0.0.0.0',
        'pm2 start ../sandbox',
        'pm2 start ../node/bin/yarn --name hydrooj -- hydrooj',
        'pm2 save',
      ]
      for (const operation of operations) {
        await run(operation.split(' '))
      }
      fs.writeFileSync('.installed', 'Remove me to reinstall.')
    } else {
      console.log('Hydro is already installed, starting...')
      await run(['pm2', 'resurrect'])
    }
  } else await run(process.argv.splice(2))
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
  const saves = ['hydro/package.json', 'hydro/yarn.lock', 'hydro/.yarnrc.yml']
  await Promise.all(
    saves.map((file) =>
      rename(resolve(file, 'dist'), resolve(file, 'dist') + '.save')
    )
  )
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
  await Promise.all(
    saves.map((file) =>
      rename(resolve(file, 'dist') + '.save', resolve(file, 'dist'))
    )
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
    resolve('hydrocli', 'dist'),
    '#!./node/bin/node\n' + main.toString() + '\nmain()'
  )
  await chmod(resolve('hydrocli', 'dist'), 0o755)
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
