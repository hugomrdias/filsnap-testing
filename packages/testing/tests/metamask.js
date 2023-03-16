import pRetry from 'p-retry'
import { isValidCode } from 'eth-rpc-errors/dist/utils.js'
import { EthereumRpcError } from 'eth-rpc-errors'

/**
 * @typedef {import('eth-rpc-errors/dist/classes').SerializedEthereumRpcError} SerializedEthereumRpcError
 */

/**
 *
 * @param {unknown} obj
 * @returns {obj is SerializedEthereumRpcError}
 */
function isMetamaskRpcError(obj) {
  if (!obj) return false
  if (!(obj instanceof Object)) return false
  if (!('code' in obj)) return false
  if (!('message' in obj)) return false

  if (isValidCode(obj.code)) {
    return true
  }

  return false
}

/**
 *
 * @param {import('@playwright/test').Page} page
 */
async function ensurePageLoadedURL(page) {
  if (page.url() === 'about:blank') {
    await page.goto('https://example.org')
  }
  await page.bringToFront()

  return page
}

/**
 * Snap approve
 *
 * @param {import('@playwright/test').Page} page
 */
async function snapApprove(page) {
  await page
    .getByRole('button')
    .filter({ hasText: 'Approve & install' })
    .click()
  await page.getByLabel('Test Networks').click()
  await page.getByLabel('Filecoin key').click()
  await page.getByRole('button').filter({ hasText: 'Confirm' }).click()
}

/**
 * Wait for a metamask notification
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
function waitNotification(page, name) {
  async function run() {
    if (!page.url().includes(name)) {
      await page.reload({ waitUntil: 'domcontentloaded' })
      throw new Error('not yet')
    }
  }

  return pRetry(run, { retries: 5, factor: 1 })
}

export class Metamask {
  /**
   *
   * @param {import('@playwright/test').BrowserContext} context
   * @param {string} extensionId
   * @param {import('@playwright/test').Page} testPage
   */
  constructor(context, extensionId, testPage) {
    this.context = context
    this.extensionId = extensionId
    this.testPage = testPage
    this.walletPage = undefined
    this._rpcPage = undefined
  }

  /**
   *
   * @param {string} seed
   * @param {string} password
   */
  async onboard(
    seed = 'already turtle birth enroll since owner keep patch skirt drift any dinner',
    password = '12345678'
  ) {
    // setup metamask
    const page = await this.wallet()
    await page.getByText('accept').click()

    // import wallet
    await page.getByTestId('onboarding-import-wallet').click()
    await page.getByTestId('metametrics-no-thanks').click()

    for (const [index, seedPart] of seed.split(' ').entries()) {
      await page.getByTestId(`import-srp__srp-word-${index}`).type(seedPart)
    }
    await page.getByTestId('import-srp-confirm').click()
    await page.getByTestId('create-password-new').type(password)
    await page.getByTestId('create-password-confirm').type(password)
    await page.getByTestId('create-password-terms').click()
    await page.getByTestId('create-password-import').click()
    await page.getByTestId('onboarding-complete-done').click()
    await page.getByTestId('pin-extension-next').click()
    await page.getByTestId('pin-extension-done').click()

    return this
  }

  /**
   * Get metamask page
   */
  async wallet() {
    if (!this.walletPage) {
      const page = this.context
        .pages()
        .find((p) =>
          p.url().startsWith(`chrome-extension://${this.extensionId}`)
        )
      this.walletPage =
        page ||
        (await this.context.waitForEvent('page', {
          predicate: (page) => {
            return page
              .url()
              .startsWith(`chrome-extension://${this.extensionId}`)
          },
        }))
      await this.walletPage.waitForLoadState('domcontentloaded')
    }

    await this.walletPage.bringToFront()

    return this.walletPage
  }

  /**
   * Get metamask page
   */
  async rpcPage() {
    if (!this._rpcPage) {
      const page = await this.context.newPage()
      await page.goto('https://example.org')
      this._rpcPage = page
    }

    await this._rpcPage.bringToFront()

    return this._rpcPage
  }

  /**
   * Install a snap
   *
   * @param {import('./types').InstallSnapOptions} options
   */
  async installSnap(options) {
    const rpcPage = await ensurePageLoadedURL(options.page ?? this.testPage)

    const install = rpcPage.evaluate(
      async ({ snapId, version }) => {
        const api =
          /** @type {import('@metamask/providers').MetaMaskInpageProvider} */ (
            window.ethereum
          )
        try {
          const result = await api.request({
            method: 'wallet_requestSnaps',
            params: {
              [snapId]: {
                version: version ?? 'latest',
              },
            },
          })

          return result
        } catch (error) {
          return /** @type {error} */ (error)
        }
      },
      { snapId: options.snapId, version: options.version }
    )
    // Snap popup steps
    const wallet = await this.wallet()
    await waitNotification(wallet, 'confirm-permissions')
    await wallet.getByRole('button').filter({ hasText: 'Connect' }).click()
    try {
      await waitNotification(wallet, 'snap-install')
      await snapApprove(wallet)
    } catch {}

    const result = await install

    if (isMetamaskRpcError(result)) {
      throw new EthereumRpcError(result.code, result.message, result.data)
    }

    if (!result) {
      throw new Error(
        `Unknown RPC error: "wallet_requestSnaps" didnt return a response`
      )
    }

    await this.testPage.bringToFront()
    return /** @type {import('./types').InstallSnapsResult} */ (result)
  }

  /**
   * Install a snap
   *
   * @param {import('@playwright/test').Page} [page] - Page to run getSnaps
   */
  async getSnaps(page) {
    const rpcPage = await ensurePageLoadedURL(page ?? this.testPage)

    const install = rpcPage.evaluate(async () => {
      const api =
        /** @type {import('@metamask/providers').MetaMaskInpageProvider} */ (
          window.ethereum
        )
      try {
        const result = await api.request({
          method: 'wallet_getSnaps',
        })

        return result
      } catch (error) {
        return /** @type {error} */ (error)
      }
    })

    const result = await install

    if (isMetamaskRpcError(result)) {
      throw new EthereumRpcError(result.code, result.message, result.data)
    }

    if (!result) {
      throw new Error(
        `Unknown RPC error: "wallet_requestSnaps" didnt return a response`
      )
    }

    await this.testPage.bringToFront()
    return /** @type {import('./types').InstallSnapsResult} */ (result)
  }
}