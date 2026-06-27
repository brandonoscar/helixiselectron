import { describe, it, expect } from 'vitest'
import { searchResultsHTML, type SearchPageData } from './searchpage'

const base: SearchPageData = {
  query: 'zillow',
  answer: 'Zillow is a real-estate marketplace.',
  results: [
    { title: 'Zillow', url: 'https://www.zillow.com/', snippet: 'Homes for sale.' }
  ],
  warnings: []
}

describe('searchResultsHTML', () => {
  it('renders the Helixis brand + a query-filled search box', () => {
    const html = searchResultsHTML(base, 'helixis://search')
    expect(html).toContain('Helixis')
    expect(html).toContain('◐')
    expect(html).toContain('value="zillow"')
    expect(html).toContain('action="helixis://search"')
  })

  it('renders results (host, title, snippet) and the answer summary', () => {
    const html = searchResultsHTML(base, 'helixis://search')
    expect(html).toContain('href="https://www.zillow.com/"')
    expect(html).toContain('zillow.com') // www. stripped for the host line
    expect(html).toContain('Zillow is a real-estate marketplace.')
  })

  it('escapes web-sourced text to prevent markup injection', () => {
    const evil: SearchPageData = {
      query: '<img src=x>',
      answer: null,
      results: [{ title: '<script>alert(1)</script>', url: 'https://e.com', snippet: '' }],
      warnings: []
    }
    const html = searchResultsHTML(evil, 'helixis://search')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('value="&lt;img src=x&gt;"')
  })

  it('shows a graceful notice when the provider is unavailable', () => {
    const html = searchResultsHTML(
      { query: 'zillow', results: [], warnings: ['search_unavailable'] },
      'helixis://search'
    )
    expect(html).toContain('Search is unavailable')
    // The search box stays so the user can retry.
    expect(html).toContain('action="helixis://search"')
  })

  it('shows an empty-state when the search ran but found nothing', () => {
    const html = searchResultsHTML(
      { query: 'asdfqwerzxcv', results: [], warnings: [] },
      'helixis://search'
    )
    expect(html).toContain('No results')
  })

  it('treats a hard fetch failure as the unavailable state', () => {
    const html = searchResultsHTML(
      { query: 'zillow', results: [], warnings: [] },
      'helixis://search',
      true
    )
    expect(html).toContain('Search is unavailable')
  })
})
