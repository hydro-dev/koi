import axios from 'axios'
import * as fs from 'fs'
import { error, info } from 'gulplog'
import * as lzma from 'lzma-native'
import stream from 'stream'
import * as tar from 'tar'
import { promisify } from 'util'
import { nodeVersion } from './config'
import { resolve } from './path'
import { exists, notEmpty } from './utils'

const nodeFolderLinux = `node-v${nodeVersion}-linux-${process.arch}`
const srcPathLinux = `https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v${nodeVersion}/${nodeFolderLinux}.tar.xz`
const destPathLinux = resolve('node.tar.xz', 'cache')

const buildDownloadNode =
  (srcPath: string, destPath: string): (() => Promise<void>) =>
  async () => {
    info('Checking Node.js temporary cache.')
    if (await exists(destPath)) {
      info('Node.js exists. Skipping download.')
      info("If you want to re-download Node.js, use 'gulp clean'.")
      return
    }

    info('Now downloading.')
    const res = await axios.get(srcPath, { responseType: 'stream' })
    const writeStream = fs.createWriteStream(destPath)
    await promisify(stream.finished)(
      (res.data as stream.Readable).pipe(writeStream)
    )
  }

async function extractNode(destPath: string) {
  info('Checking Node.js temporary cache.')
  if (await notEmpty(resolve('node', 'dist'))) {
    info('Node.js exists. Skipping extract.')
    return
  }

  if (!(await exists(destPath))) {
    const err = "Node.js dist not found. Try 'gulp clean && gulp prepareNode'."
    error(err)
    throw new Error(err)
  }

  info('Now extracting.')
  await promisify(stream.finished)(
    fs
      .createReadStream(destPath)
      .pipe(lzma.createDecompressor())
      .pipe(tar.extract({ cwd: resolve('node', 'dist'), strip: 1 }))
  )
}

export async function prepareNode(): Promise<void> {
  info(`Downloading Node.js for ${process.platform} on ${process.arch}.`)
  await buildDownloadNode(srcPathLinux, destPathLinux)()
  await extractNode(destPathLinux)
}
