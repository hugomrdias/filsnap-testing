import { test as base, chromium } from '@playwright/test'
import { download } from 'filsnap-testing-tools'
import { Metamask } from './metamask.js'

/**
 * @typedef {import('@playwright/test').PlaywrightTestArgs} PlaywrightTestArgs
 * @typedef {import('@playwright/test').PlaywrightTestOptions} PlaywrightTestOptions
 * @typedef {import('@playwright/test').PlaywrightWorkerArgs} PlaywrightWorkerArgs
 * @typedef {import('@playwright/test').PlaywrightWorkerOptions} PlaywrightWorkerOptions
 * @typedef {import('@playwright/test').BrowserContext} BrowserContext
 * @typedef {import('@playwright/test').TestType<PlaywrightTestArgs & PlaywrightTestOptions & {
    context: BrowserContext;
    metamask: Metamask
}, PlaywrightWorkerArgs & PlaywrightWorkerOptions>} TestType
 */

/** @type {TestType} */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = await download({
      repo: 'MetaMask/metamask-extension',
      tag: 'latest',
      asset: 'metamask-flask-chrome-[tag]-flask.0',
    })

    // Launch context with extension
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        // `--headless=new`,
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })

    await use(context)
    await context.close()
  },

  metamask: async ({ context }, use) => {
    let [background] = context.backgroundPages()
    if (!background) {
      background = await context.waitForEvent('backgroundpage')
    }

    // Create metamask
    const extensionId = background.url().split('/')[2]
    const metamask = new Metamask(context, extensionId)

    await use(metamask)
  },
})
export const expect = test.expect
