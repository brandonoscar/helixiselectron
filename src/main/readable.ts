import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import type { WebContents } from 'electron'
import type { PageContext } from '../shared/types'

/** Cap the extracted text so we never ship a huge payload into the copilot
 *  prompt context. ~8k chars is plenty for "answer about this page". */
const MAX_TEXT = 8000

/**
 * Extract the clean main text of the page loaded in `wc` using Mozilla
 * Readability (the engine behind Firefox Reader View) — drops nav, ads,
 * sidebars, footers. Returns null for non-web pages (the Helixis new-tab /
 * error pages, about:) or when extraction fails, so callers degrade quietly.
 *
 * We pull the page's serialized HTML out of the live tab and re-parse it in a
 * throwaway JSDOM, rather than mutating the user's actual page.
 */
export async function extractReadable(wc: WebContents): Promise<PageContext | null> {
  const url = wc.getURL()
  if (!url || url.startsWith('helixis://') || url.startsWith('about:')) return null

  try {
    const html = (await wc.executeJavaScript(
      'document.documentElement.outerHTML'
    )) as string
    const dom = new JSDOM(html, { url })
    const article = new Readability(dom.window.document).parse()
    const raw = (article?.textContent ?? dom.window.document.body?.textContent ?? '').trim()
    if (!raw) return null
    return {
      url,
      title: article?.title || wc.getTitle() || url,
      // Collapse runs of blank lines/space so the context is compact.
      text: raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, MAX_TEXT)
    }
  } catch {
    return null
  }
}
