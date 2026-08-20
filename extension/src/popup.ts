/*
 * The popup.
 *
 * Same design system, same provenance badges, same rules as the app. Two of
 * those rules matter more here than anywhere, because a popup is small and
 * glanced at:
 *
 *   - A null figure renders as "Not available" with the reason, never as a
 *     dash the reader fills in themselves and never as zero.
 *   - Every figure carries its badge. In 380 pixels the temptation is to drop
 *     the qualifier and keep the number; that is exactly backwards, because a
 *     glanced-at number is the one most likely to be repeated as fact.
 *
 * No framework. The popup is a few hundred lines of DOM and stays that way.
 */

import { fetchListing, APP_ORIGIN } from './client.js'
import type { ExtensionMetric, ExtensionResponse } from '../../lib/extension/contract.js'

declare const chrome: {
  tabs: {
    query(q: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]>
    sendMessage(tabId: number, message: unknown): Promise<{ listingId: string | null } | undefined>
    create(options: { url: string }): Promise<unknown>
  }
}

const PROVENANCE_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  CALCULATED: 'Calculated',
  ESTIMATED: 'Estimated',
  SELLER_INPUT: 'Seller input',
  AI_DRAFT: 'AI draft',
  UNAVAILABLE: 'Unavailable',
}

const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'High',
  MODERATE: 'Moderate',
  LOW: 'Low',
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function badge(type: string): HTMLElement {
  const node = el('span', `badge badge-${type.toLowerCase()}`, PROVENANCE_LABEL[type] ?? type)
  node.setAttribute('role', 'note')
  return node
}

function metricRow(metric: ExtensionMetric): HTMLElement {
  const row = el('div', 'metric')

  const head = el('div', 'metric-head')
  head.append(el('span', 'metric-label', metric.label), badge(metric.provenance))
  row.append(head)

  if (metric.display === null) {
    /*
     * Unavailable is a state, not a formatting problem. The reason goes on the
     * screen: "Etsy does not expose listing views" is information, "—" is not.
     */
    row.append(el('span', 'metric-value metric-unavailable', 'Not available'))
    row.append(el('span', 'metric-note', metric.methodology))
  } else {
    row.append(el('span', 'metric-value', metric.display))
    if (metric.confidence) {
      row.append(el('span', 'metric-note', `Confidence ${CONFIDENCE_LABEL[metric.confidence] ?? metric.confidence}`))
    }
  }

  if (metric.limitations?.length) {
    const list = el('ul', 'metric-limits')
    for (const line of metric.limitations) list.append(el('li', undefined, line))
    row.append(list)
  }

  const how = el('button', 'link', 'How is this calculated?')
  how.addEventListener('click', () => {
    const open = row.classList.toggle('open')
    how.setAttribute('aria-expanded', String(open))
  })
  how.setAttribute('aria-expanded', 'false')
  row.append(how, el('p', 'metric-methodology', metric.methodology))

  return row
}

function actionLink(label: string, href: string): HTMLElement {
  const link = el('a', 'action', label)
  link.setAttribute('href', href)
  link.setAttribute('target', '_blank')
  link.setAttribute('rel', 'noopener noreferrer')
  return link
}

function emptyState(title: string, body: string, cta?: { label: string; href: string }): HTMLElement {
  const wrap = el('div', 'empty')
  wrap.append(el('h2', 'empty-title', title), el('p', 'empty-body', body))
  if (cta) wrap.append(actionLink(cta.label, cta.href))
  return wrap
}

function render(response: ExtensionResponse): HTMLElement {
  switch (response.state) {
    case 'SIGNED_OUT':
      return emptyState('Connect your EtsyPilot account to continue', response.message, {
        label: 'Log in',
        href: response.signInUrl,
      })

    case 'NO_SHOP':
      return emptyState('No Etsy shop connected', response.message, {
        label: 'Connect Etsy shop',
        href: response.connectUrl,
      })

    case 'NOT_A_LISTING':
      return emptyState(
        'No Etsy listing on this page',
        `${response.message} The extension only reads pages you visit on etsy.com — it does nothing on any other site.`,
        { label: 'Go to Etsy', href: response.etsyUrl },
      )

    case 'ERROR':
      return emptyState(response.message, response.recovery)

    case 'OK': {
      const { listing } = response
      const wrap = el('div', 'listing')

      wrap.append(el('h2', 'listing-title', listing.title))
      wrap.append(
        el(
          'p',
          'listing-shop',
          listing.isOwnListing ? 'Your shop' : `${listing.shopName} · public data only`,
        ),
      )

      if (listing.health) {
        const health = el('section', 'health')
        const head = el('div', 'metric-head')
        head.append(el('span', 'metric-label', 'Listing health'), badge(listing.health.provenance))
        health.append(head)
        health.append(
          el('span', 'health-score', `${listing.health.score}`),
          el('span', 'health-band', `/ 100 · ${listing.health.band.toLowerCase()}`),
          el(
            'span',
            'metric-note',
            listing.health.improvements === 0
              ? 'No open findings on this listing.'
              : `${listing.health.improvements} improvement${listing.health.improvements === 1 ? '' : 's'} recommended`,
          ),
        )
        wrap.append(health)
      } else {
        /*
         * Not a gap to fill. A health score for a listing we cannot see the
         * costs or receipts of would look like the same number and mean
         * something else.
         */
        wrap.append(
          el(
            'p',
            'metric-note',
            'No health score for another shop’s listing — it is computed from your confirmed costs and verified revenue.',
          ),
        )
      }

      if (listing.primaryKeyword) wrap.append(metricRow(listing.primaryKeyword))
      for (const metric of listing.metrics) wrap.append(metricRow(metric))

      if (listing.recommendation) {
        const rec = el('section', 'recommendation')
        rec.append(el('h3', 'rec-title', 'Recommended action'), el('p', 'rec-body', listing.recommendation))
        wrap.append(rec)
      }

      const actions = el('nav', 'actions')
      actions.setAttribute('aria-label', 'Open in EtsyPilot')
      for (const action of listing.actions) actions.append(actionLink(action.label, action.href))
      wrap.append(actions)

      wrap.append(
        el(
          'p',
          'observed',
          `Observed ${listing.observedOn} · this extension reads only. It cannot edit, publish or deactivate a listing.`,
        ),
      )
      return wrap
    }
  }
}

async function currentListingId(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return null
    const answer = await chrome.tabs.sendMessage(tab.id, { type: 'WHICH_LISTING' })
    return answer?.listingId ?? null
  } catch {
    // No content script on this page — it is not etsy.com. Not an error.
    return null
  }
}

async function main(): Promise<void> {
  const root = document.getElementById('root')
  if (!root) return

  root.replaceChildren(el('div', 'skeleton', 'Loading…'))
  const response = await fetchListing(await currentListingId())
  root.replaceChildren(render(response))

  const footer = document.getElementById('app-origin')
  if (footer) footer.textContent = new URL(APP_ORIGIN).host
}

void main()
