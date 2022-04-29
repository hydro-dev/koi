import child from 'child_process'
import * as fs from 'fs'
import { error, info } from 'gulplog'
import stream from 'stream'
import * as tar from 'tar'
import { promisify } from 'util'
import { resolve } from './path'
import mkdirp from 'mkdirp'
import { exists, notEmpty } from './utils'
import { chmod } from 'fs-extra'

const minioPath = 'https://dl.min.io/server/minio/release/linux-amd64/minio'
const sandboxPath =
  'https://github.com/criyle/go-judge/releases/download/v1.4.0/executorserver-amd64'
const mongodbPath =
  'https://downloads.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-v5.0-latest.tgz'

const buildDownload =
  (
    name: string,
    srcPath: string,
    destPath: string,
    extract?: string
  ): (() => Promise<void>) =>
  async () => {
    info(`Checking ${name} temporary cache.`)
    if (await exists(destPath)) {
      info(`${name} exists. Skipping download.`)
      info(`If you want to re-download ${name}, use 'gulp clean'.`)
      if (extract) await extractFile(name, destPath, extract)
      return
    }

    info('Now downloading.')
    await child.exec(`curl -sSL ${srcPath} -o ${destPath}`)
  }

async function extractFile(name: string, destPath: string, extract: string) {
  info(`Checking ${name} temporary cache.`)
  if ((await exists(extract)) && (await notEmpty(extract))) {
    info(`${name} exists. Skipping extract.`)
    return
  } else {
    await mkdirp(extract)
  }

  if (!(await exists(destPath))) {
    const err = `${name} dist not found. Try 'gulp clean && gulp extra'.`
    error(err)
    throw new Error(err)
  }

  info('Now extracting.')
  await promisify(stream.finished)(
    fs.createReadStream(destPath).pipe(tar.extract({ cwd: extract, strip: 1 }))
  )
}

export async function prepareExtra(): Promise<void> {
  info(`Downloading Extra Files...`)
  const files = [
    { name: 'minio', srcPath: minioPath, destPath: resolve('minio', 'dist') },
    {
      name: 'sandbox',
      srcPath: sandboxPath,
      destPath: resolve('sandbox', 'dist'),
    },
    {
      name: 'mongodb',
      srcPath: mongodbPath,
      destPath: resolve('mongodb.tgz', 'cache'),
      extract: resolve('mongodb', 'dist'),
    },
  ]
  await Promise.all(
    files.map((file) =>
      buildDownload(file.name, file.srcPath, file.destPath, file.extract)()
    )
  )
  await chmod(resolve('minio', 'dist'), 0o755)
  await chmod(resolve('sandbox', 'dist'), 0o755)
}
